/* Vote Unbiased service worker — live-broadcast push notifications. */
self.addEventListener("push", (event) => {
  let data = { title: "Vote Unbiased", body: "A live broadcast is being fact-checked now.", url: "/live" };
  try { data = { ...data, ...event.data.json() }; } catch { /* default */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-light-32x32.png",
    badge: "/icon-light-32x32.png",
    data: { url: data.url || "/live" },
    tag: "vu-live", // collapse repeat pings for the same event
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/live";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.includes("/live") && "focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
