---
'@bieberkit/http': patch
---

Fix an uncaught exception ("Controller is already closed") on Node 24.12 when `http.fetch` dropped the body of a response for a retry or a redirect while chunks were still arriving. The body is now read by pull, a body over the limit no longer raises an uncaught error when nobody reads it, and closing the body closes the socket.
