# StudentInvite

A student's card opened to invite them: tick what they still owe, then one WhatsApp link that signs them in and asks for it.

**Markup:** the `.teacher-setup.is-open` card with its invite panel: `Send Sam their link`, the dab `Signs them in once, within 14 days.`, `Tick what Sam still owes. Leave any paid in cash.` over the unpaid lessons, then (once made) the Message field, outline `Copy` and coral `Send on WhatsApp`.

- Nothing is ticked to start (many were paid in cash). The action names the total: `Make link with €45 to pay`, or `Make link, nothing to pay`; the panel then says `Asks them to pay €45 for 3 lessons. Nothing is charged until they agree.`
- The message is two lines she can edit (`Olá Sam! From now on you can book, move or cancel your lessons with me here, and pay for the 2 lessons still open (€50).`), the link on its own line after her words. Keep it short: the site does the teaching.
- `Send on WhatsApp` opens WhatsApp to their number only when it is certain (`+` or `00`, or a nine-digit Portuguese mobile), otherwise WhatsApp's own chooser. Nothing is sent until she presses Send there. A student with an email can have `Email instead`.

## Write

Drawn by `WhatsAppInvite` (`src/components/teacher/WhatsAppInvite.tsx`) inside a student’s row (`StudentSetupRow`); the message itself is `inviteMessage` there. Change it there.

## Source

- `src/components/teacher/WhatsAppInvite.tsx#WhatsAppInvite`
- `src/components/teacher/WhatsAppInvite.tsx#inviteMessage`
