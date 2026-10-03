# Discord Family Check-in (ADHD & Seven)

Spontaneous, scheduled check-ins between ADHD and Seven on Discord in `#general`.

## How it works
1. Runs ~3 times a day via `family-checkin.timer`:
   - Morning: ~09:30 AM Eastern
   - Afternoon: ~02:15 PM Eastern
   - Evening: ~07:45 PM Eastern
   - `RandomizedDelaySec=1800` ensures natural daily jitter (up to 30 mins) so it doesn't trigger at an exact fixed minute.
2. Checks `#general` channel activity:
   - If anyone (Darren or either bot) sent a message within the last 20 minutes, the scheduled check-in is skipped to avoid interrupting active conversations.
3. Alternates initiator:
   - Either ADHD initiates to Seven or Seven initiates to ADHD.
   - The initiator calls their backend AI (`/api/omniroute/chat`) to generate a unique, in-character greeting and observation.
   - The message is posted to `#general` tagging the other bot (`<@id>`).
4. Discord cross-agent dialogue:
   - The tagged bot detects the mention from her family member.
   - She fetches the channel history (with speaker attribution `[ADHD]:` / `[Seven]:`).
   - She responds directly in `#general`.
   - The conversation continues for up to 3 turns (`MAX_BOT_TURNS=3`), at which point the bridge circuit breaker pauses automated replies until Darren speaks again.

## Manual Testing
- Dry run (generates the message without posting to Discord):
  ```bash
  node ops/family-checkin/family_checkin.mjs --dry-run
  ```
- Force run (bypasses the 20-minute cooldown):
  ```bash
  node ops/family-checkin/family_checkin.mjs --force
  ```
- Force specific initiator:
  ```bash
  node ops/family-checkin/family_checkin.mjs --force --from adhd
  node ops/family-checkin/family_checkin.mjs --force --from seven
  ```

## Service & Timer Management
- Check timer status: `systemctl status family-checkin.timer`
- Check next trigger time: `systemctl list-timers | grep checkin`
- View logs: `tail -f ~/logs/family-checkin.log`
