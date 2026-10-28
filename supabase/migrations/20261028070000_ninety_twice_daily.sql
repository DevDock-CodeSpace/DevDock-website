-- ninety-sync runs twice a day instead of checking every minute (owner, 2026-10-28: no job that keeps
-- querying all day). At 00:00 and 12:00 UTC the queue is sent in one batch; between runs, anyone in the group
-- can send it at once with "Sync now" on the Ninety page. The daily sprint check stays (00:05 UTC, before noon's run).

select cron.unschedule('ninety-sync');
select cron.schedule('ninety-sync', '0 0,12 * * *', 'select private.ninety_kick()');
