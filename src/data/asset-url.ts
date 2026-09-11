export function resolvePublicAsset(path: string | undefined, baseUrl = import.meta.env.BASE_URL): string | undefined {
  if (!path || !path.startsWith('/')) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}
