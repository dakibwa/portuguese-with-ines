# Receipts

Receipts: the month's payments with what still needs a receipt issued, and Download CSV.

**Markup:** `.teacher-receipts` card: the month and pager, a coral dab (`2 receipts to issue · €57`), outline `Download CSV`, then a table (Lesson, Student, NIF, For, Amount, Status).

- Table heads in `legend-label`; rows are `raised` strips; the status is a small blue pill (`Paid by hand`).
- It opens on last month during the first ten days of a month when last month still has receipts to issue and this one has none.

## Write

```tsx
<ReceiptsTab token={token} today={today} />
```

Inês’s Receipts tab, in `TeacherSchedule`.

## Source

- `src/components/teacher/ReceiptsTab.tsx#ReceiptsTab`
- `src/components/TeacherSchedule.tsx`, find `<ReceiptsTab`
