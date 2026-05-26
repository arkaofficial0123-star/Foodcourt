# Security Specification & Threat Model

This document outlines the security architecture and threat model for the digital Table Menu & QR Ordering App. Access control is client-side as per specifications (without personal Firebase auth accounts), but the database must remain resilient against payload pollution, schema tampering, state shortcutting, and data corruption.

## 1. Data Invariants

### Menu Items (`/items/{itemId}`)
* Must have a string name (1 to 100 characters).
* Must have a positive price (greater than 0).
* Must have a string imageUrl or base64 data url.
* Must include a validation of the document ID.

### Settings (`/settings/banner`)
* Must have a string promotional text.
* Must have a string imageUrl (for the banner background).
* Must have a boolean visibility toggle.

### Orders (`/orders/{orderId}`)
* Must have a tableId (identifying which table ordered).
* Must contain an items array.
* Total must equal the exact calculated sum of items or at least be a positive number.
* Status must only be one of: `pending`, `accepted`, `completed`.
* Status is initialized to `pending` on creation. Only updates can advance it to `accepted` or `completed`.
* `tableId`, `items`, and `total` are immutable once created.

---

## 2. The "Dirty Dozen" Payloads

Here are twelve payloads that violate our application's visual/data invariants, which the security rules must reject:

1. **Item Creation with Negative Price**: Placing an menu item at $-5.00.
2. **Item Creation with Excess Name**: Setting a menu name with a 50KB garbage string to exhaust Firestore bandwidth.
3. **Item Update of ID Path**: Attempting to inject weird characters in document creation ID (e.g. `items/some..path/pollution`).
4. **Order State Shortcutting**: A customer submitting an order directly with `status = "completed"`.
5. **Order State Reverse Transition**: Admin attempting to downgrade an order from `completed` back to `pending`.
6. **Order Total Manipulation**: Malicious client updating an existing order's `total` to $0.00 after it's been sent.
7. **Order Item Pollution**: Submitting an order with a non-array `items` field.
8. **Banner Visibility Type Tampering**: Submitting `"visible" : "yes"` (string) instead of a boolean representation.
9. **Order Empty Table**: Placing an order with an empty `tableId` or a non-string table identifier.
10. **Order Injection Attack**: Supplying additional fields (e.g., `isVerified: true` or `vipStatus: true`) to a document (Shadow Field).
11. **Item Image URL Type Pollution**: Replacing the item image field with a map instead of a string URL.
12. **Settings Deletion**: Any client attempting to delete the global `/settings/banner` document.

---

## 3. Test Cases (Mocked Schema Runner Spec)

We will implement the validation rules directly in static firestore helper syntax. Since Firebase Auth is disabled, we secure everything using:
- **Exact Key size validations** on creation (the `data.keys().hasAll(...) && data.keys().size() == N` pattern).
- **Type verification** for strings, numbers, arrays, and map structures.
- **Value bound checking** (e.g., image string length, prices > 0).
- **State Transition Guarding** for the single order update route.
