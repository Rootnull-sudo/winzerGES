# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [1.0.2] - 2026-11-13

### Added
- Lanzadores `Iniciar Winzer (Windows).bat` y `Iniciar Winzer (Mac-Linux).command`: abren la app en `http://localhost:8642` para usarla en cualquier navegador, incluido Firefox, con los datos guardados de forma estable.
- Aviso en bienvenida, inicio de sesión y todas las páginas cuando la app se abre como archivo en Firefox o Safari, que no conservan esos datos de forma confiable.

## [1.0.1] - 2026-11-13

### Fixed
- Cargar los datos de ejemplo ya no reemplaza el nombre ni los datos de una viña creada por el usuario, y "Borrar datos demo" ya no borra la configuración de la empresa (se restaura la anterior).

### Added
- Opción "Restaurar respaldo" en la pantalla de bienvenida y ayuda "¿No ves tu viña o tu usuario?" en el inicio de sesión.
- Solicitud de almacenamiento persistente al navegador para evitar que borre los datos por falta de espacio.

## [1.0.0] - 2026-11-13

### Added
- Núcleo modular: registro central de módulos con carga bajo demanda, router por hash, event bus de dominio, store global.
- Capa de datos en IndexedDB con respaldo en localStorage, esquema versionado con migraciones automáticas y auditoría de registros sensibles.
- Autenticación local con PIN (SHA-256), seis roles predefinidos, roles personalizados con permisos por módulo y bloqueo por inactividad.
- 25 módulos: catastro, fenología, insumos y labores, cosecha, calendario de vendimia, laboratorio, vinificación, fermentación (control de metabisulfito en modo suave), bodega, histórico, envasado con costo unitario y validador de etiqueta, ventas, inventarios, marca y etiquetas, clientes y cobranza, costos, financiero (estado de resultados, ratios, punto de equilibrio, simulador, flujo de caja, BCG), sueldos y gastos, proveedores y compras, cumplimiento normativo, DTE con XML SII, conciliación bancaria, F29/PPM/Renta, usuarios y dashboard gerencial.
- Diseño blanco y negro de Winzer Gestión con modo oscuro, accesibilidad AA, onboarding y ayuda integrada.
- Datos de ejemplo ficticios de dos temporadas.
- Respaldo y restauración JSON y CSV.
- Repositorio listo para GitHub: README, CONTRIBUTING, LICENSE, plantillas de issues/PR, GitHub Actions para Pages y releases, documentación en `/docs`.

[Sin publicar]: https://github.com/Rootnull-sudo/winzerGES/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/Rootnull-sudo/winzerGES/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Rootnull-sudo/winzerGES/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Rootnull-sudo/winzerGES/releases/tag/v1.0.0
