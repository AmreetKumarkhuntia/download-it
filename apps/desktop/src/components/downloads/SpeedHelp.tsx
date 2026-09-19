export function SpeedHelp() {
  return (
    <details className="speed-help">
      <summary>Why might Chrome be faster?</summary>
      <p>
        More connections do not always improve speed. A server may limit parallel requests or total
        bandwidth; other active downloads share your connection and the total speed cap. Browser
        caching, cookies, request headers and network protocols can also change the result.
      </p>
      <p>
        Compare the same direct URL, one download at a time, with the speed cap set to unlimited.
        Try 1, 4 and 8 connections in Preferences, then pause and resume to apply each change.
        Compare sustained speeds after the initial connection setup. These measurements do not
        identify server throttling on their own.
      </p>
    </details>
  );
}
