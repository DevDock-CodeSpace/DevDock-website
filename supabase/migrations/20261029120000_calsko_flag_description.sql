-- The product is called Calsko now (2026-10-29). The flag's key stays `ask_devdock` (the app and the
-- ai-agent function read it); only the description shown in the admin console changes.

update public.feature_flags
set description = 'Calsko AI: the AI assistant in the header (⌘K). It reads and changes things with the person''s own access.'
where key = 'ask_devdock';
