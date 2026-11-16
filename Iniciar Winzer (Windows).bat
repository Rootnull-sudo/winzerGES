@echo off
REM Abre Winzer Gestion en http://localhost:8642 (funciona en Chrome, Edge y Firefox).
REM Deja abierta la ventana negra mientras usas la app.
title Winzer Gestion
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\servidor.ps1"
