# 0003. Sincronización offline propia

- Estado: Aceptado · Fecha: 2026-11-17

## Contexto
Operación, bodega y administración deben funcionar sin señal en el campo. El resto es online.

## Decisión
IndexedDB (Dexie) por usuario y viña, cola de mutaciones (outbox) con ids generados en el cliente, push
idempotente que reutiliza `repo.upsert`, y pull por cursor `(xid, seq)` que solo entrega transacciones terminadas.
Concurrencia por `version`: gana el servidor y se avisa.

## Consecuencias
Sin servicio externo y con las mismas validaciones y permisos que el resto. El dominio de Winzer (movimientos
append-only) casi no genera conflictos. Hay que mantener el motor (~300 líneas) y sus tests.

## Alternativas consideradas
PowerSync / ElectricSQL: más capacidades (tiempo real, consultas locales SQL) a costa de otro servicio y otro
modelo de permisos. Revisar si el volumen offline crece mucho o se necesita tiempo real.
