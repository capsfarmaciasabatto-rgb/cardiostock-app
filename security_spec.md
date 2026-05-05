# Security Specification - CardioStock

## Data Invariants
1. A Movement must always be associated with an existing Medicine.
2. `stockActual` must always equal `stockInicial + (sum of all "ingreso" movements) - (sum of all "dispensa" movements)`.
3. Medicine IDs and Movement IDs must be alphanumeric and reasonably sized.
4. `quantity` in a Movement must be a positive number.
5. `type` in a Movement must be either 'ingreso' or 'dispensa'.

## The Dirty Dozen Payloads (Targeting Rejection)
1. Creating a Medicine with a 2MB string as `droga` (Resource Exhaustion).
2. Updating a Medicine's `stockActual` directly without a Movement (Relational Sync violation).
3. Creating a Movement with `type: 'robo'` (Schema violation).
4. Creating a Movement with `quantity: -50` (Boundary violation).
5. Deleting a Movement record (Integrity violation - movements should be immutable/audit trail).
6. Creating a Medicine with a spoofed `ownerId` (Identity Spoofing).
7. Accessing medicine data without being logged in (Auth violation).
8. Listing all medicines without any query filter while not having permission (Denial of Wallet).
9. Updating `stockInicial` after creation (Immutability violation).
10. Injecting a Movement for a non-existent Medicine (Orphaned Write).
11. Using a document ID containing special characters like `../` (Path Injection).
12. Updating `updatedAt` with a client-side timestamp instead of server timestamp.

## Test Runner Plan
We will use `firestore.rules.test.ts` to verify these constraints.
