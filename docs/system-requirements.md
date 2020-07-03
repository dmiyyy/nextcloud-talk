# System requirements

## Server
Additional to normal Nextcloud requirements the following constraints apply to use Nextcloud Talk:

### HTTPS
 
HTTPS is required to be able to use WebRTC (the video call technic of browsers used by Nextcloud Talk calls).

### Database
* SQLite: must not be used, to grant a decent experience for chats and calls
* MySQL/Maria DB: Must enable utf8mb4 support** as per documentation at [Enabling MySQL 4-byte support](https://docs.nextcloud.com/server/latest/admin_manual/configuration_database/mysql_4byte_support.html)

### Webserver

Apache and Nginx must use:

* PHP FPM + mpm_events or
* PHP + mpm_prefork

Other combinations will not work due to the long polling used for chat and signaling messages, see [this issue](https://github.com/nextcloud/spreed/issues/2211#issuecomment-610198026) for details.

### TURN server

A TURN server running on **port 443** (or 80) is required in almost all scenarios, see  [Configuring coTURN](TURN.md) for more details.

## Browsers

### Recommended

* Firefox: latest
* Chrome/Chromium: latest

### Supported

* Firefox / Firefox ESR: 52 or later
* Chrome / Chromium: 49 or later
* Edge: latest
* Safari: 13 or later

## Mobile apps

* Android: 5 or later
* iOS: 10 or later
