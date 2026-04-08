/** Copy text to clipboard with fallback for browsers without navigator.clipboard. */
export function copyToClipboard(text: string, onCopied: () => void): void {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(onCopied);
  } else {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    onCopied();
  }
}
