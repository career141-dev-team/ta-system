// The Suspense boundary for the opening page: it reads the id from the URL,
// which Cache Components only allows inside one. Nothing to show while it resolves.
export default function Loading() {
  return null;
}
