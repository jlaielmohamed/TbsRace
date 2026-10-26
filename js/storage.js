/**
 * Supabase Storage helpers for the private `app-files` bucket.
 *
 * Every object path starts with the signed-in user's id:
 *   <user id>/<feature>/<item id>/<uuid>.<extension>
 *
 * The bucket is private, so callers must use `getSignedFileUrl()` to display a
 * file and `removeStoredFile()` when a database reference is deleted.
 */
import { supabase } from './supabaseClient.js';

export const STORAGE_BUCKET = 'app-files';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const AVATAR_FEATURE = 'profile';

const SIGNED_URL_EXPIRES_IN = 60 * 60;
const IMAGE_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
});
const EXTENSION_MIME_TYPES = Object.freeze({
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
});
const FILENAME_EXTENSIONS = Object.freeze({
  jpg: 'jpg',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp'
});

/** path -> { url, expiresAt } so the header and page share one signed URL. */
const signedUrlCache = new Map();

function storageError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireClient() {
  if (!supabase?.storage) throw storageError('Photo storage is not available.', 'storage_unavailable');
  return supabase.storage.from(STORAGE_BUCKET);
}

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
}

function pathSegment(value, fallback = '') {
  const segment = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return segment || fallback;
}

function normalizeExtension(extension) {
  const value = String(extension ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  const normalized = value === 'jpeg' ? 'jpg' : value;
  if (!EXTENSION_MIME_TYPES[normalized]) {
    throw storageError('Choose a JPG, PNG or WebP image.', 'storage_invalid_type');
  }
  return normalized;
}

/** A path is safe to manage only when it lives under this user's folder. */
export function isOwnedStoragePath(userId, path) {
  const prefix = `${String(userId ?? '').trim()}/`;
  return prefix.length > 1 && String(path ?? '').startsWith(prefix);
}

/**
 * Build `<user id>/<feature>/<item id>/<uuid>.<extension>`.
 * The user id is never rewritten, so the result always satisfies the bucket's
 * folder policy.
 */
export function buildStoragePath(userId, featureName, itemId, extension) {
  const user = String(userId ?? '').trim();
  if (!user || user.includes('/')) {
    throw storageError('A signed-in user is required to upload files.', 'storage_unavailable');
  }

  const feature = pathSegment(featureName, 'files');
  const item = pathSegment(itemId, 'item');
  const suffix = normalizeExtension(extension);

  return `${user}/${feature}/${item}/${makeUuid()}.${suffix}`;
}

/** Validate a profile image and return its canonical extension. */
export function validateImageFile(file, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!file || typeof file.size !== 'number' || typeof file.name !== 'string') {
    throw storageError('Choose an image file.', 'storage_invalid_type');
  }

  const mime = String(file.type ?? '').toLowerCase();
  const name = file.name.toLowerCase();
  const byExtension = FILENAME_EXTENSIONS[name.slice(name.lastIndexOf('.') + 1)];

  if (!IMAGE_EXTENSIONS[mime] && !byExtension) {
    throw storageError('Choose a JPG, PNG or WebP image.', 'storage_invalid_type');
  }
  if (file.size <= 0) {
    throw storageError('That image is empty. Choose another file.', 'storage_invalid_type');
  }
  if (file.size > maxBytes) {
    throw storageError('Choose an image smaller than 5 MB.', 'storage_too_large');
  }

  return normalizeExtension(IMAGE_EXTENSIONS[mime] ?? byExtension);
}

/**
 * Upload an image and return its storage path. The path is what belongs in the
 * database; never store the public or signed URL.
 */
export async function uploadImage({
  userId,
  file,
  featureName = 'files',
  itemId,
  maxBytes = MAX_IMAGE_BYTES
}) {
  const extension = validateImageFile(file, { maxBytes });
  const path = buildStoragePath(userId, featureName, itemId, extension);
  const bucket = requireClient();

  const { error } = await bucket.upload(path, file, {
    cacheControl: '3600',
    contentType: EXTENSION_MIME_TYPES[extension],
    upsert: false
  });
  if (error) throw error;

  // A fresh upload replaces any cached URL for this exact path (unlikely, but
  // keeps the cache honest if a caller reuses a path).
  signedUrlCache.delete(path);
  return { path, extension };
}

/** Create (or reuse) a short-lived signed URL for a private object. */
export async function getSignedFileUrl(path, { expiresIn = SIGNED_URL_EXPIRES_IN } = {}) {
  if (!path) return null;

  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;

  const bucket = requireClient();
  const { data, error } = await bucket.createSignedUrl(path, expiresIn);
  if (error) throw error;

  const url = data?.signedUrl;
  if (!url) throw storageError('We could not open that file.', 'storage_signed_url');

  signedUrlCache.set(path, { url, expiresAt: now + expiresIn * 1000 });
  return url;
}

export function clearSignedFileUrl(path) {
  if (path) signedUrlCache.delete(path);
}

/**
 * Remove an object from Storage. Pass `userId` whenever the caller knows it so
 * the helper refuses paths outside that user's folder. A missing object counts
 * as removed (the database reference is already being cleared).
 */
export async function removeStoredFile(path, { userId } = {}) {
  if (!path) return true;

  if (userId && !isOwnedStoragePath(userId, path)) {
    throw storageError('That file does not belong to this account.', 'storage_foreign_path');
  }

  const bucket = requireClient();
  const { error } = await bucket.remove([path]);
  clearSignedFileUrl(path);

  if (error) {
    if (/not\s*found|does not exist/i.test(String(error.message ?? ''))) return true;
    throw error;
  }
  return true;
}
