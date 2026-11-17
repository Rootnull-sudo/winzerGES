-- Se ejecuta una sola vez al crear el contenedor. Rol de la aplicación SIN superusuario ni BYPASSRLS:
-- todas sus consultas a tablas de negocio pasan por las políticas de Row-Level Security.
CREATE ROLE winzer_app LOGIN PASSWORD 'winzer_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE winzer TO winzer_app;
