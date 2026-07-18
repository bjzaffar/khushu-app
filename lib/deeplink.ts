let pendingUrl: string | null = null;

export function setPendingUrl(url: string | null) {
  pendingUrl = url;
}

export function consumePendingUrl(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}
