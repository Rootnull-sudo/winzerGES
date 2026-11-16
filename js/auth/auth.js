/**
 * auth/auth.js — Autenticación local básica (PIN/contraseña con hash SHA-256).
 *
 * ⚠ Seguridad: es autenticación LOCAL y BÁSICA, pensada para separar funciones
 * dentro de un mismo equipo. No es apta para exponer la app en internet:
 * cualquiera con acceso al navegador puede leer IndexedDB. Para uso multiusuario
 * real se requiere un backend con autenticación robusta (ver Roadmap en README).
 */
(function (VG) {
  'use strict';
  const U = VG.utils;
  const SESSION_KEY = 'vg:session';
  let current = null;
  let lastActivity = Date.now();
  let lockTimer = null;
  let locked = false;

  /** Hash con sal = id de usuario (evita hashes idénticos para PINs iguales). */
  async function hashPin(userId, pin) { return U.sha256('vg|' + userId + '|' + pin); }

  const Auth = {
    hashPin,
    current() { return current; },
    isLocked() { return locked; },
    users() { return VG.db.list('usuario').filter(u => u.estado !== 'inactivo').sort((a, b) => a.nombre.localeCompare(b.nombre)); },

    /** ¿El usuario activo puede hacer `action` en `moduleId`? */
    can(moduleId, action = 'v') {
      if (!current) return false;
      return VG.permissions.check(current.rol, moduleId, action);
    },

    /**
     * Inicia sesión.
     * @returns {Promise<object>} usuario
     * @throws Error con mensaje en español si falla
     */
    async login(userId, pin) {
      const u = VG.db.get('usuario', userId);
      if (!u || u.estado === 'inactivo') throw new Error('Usuario no encontrado o inactivo.');
      const h = await hashPin(u.id, pin);
      if (h !== u.pinHash) throw new Error('El PIN o contraseña no es correcto. Inténtalo de nuevo.');
      current = u;
      locked = false;
      sessionStorage.setItem(SESSION_KEY, u.id);
      await VG.db.save('usuario', Object.assign({}, u, { ultimoAcceso: new Date().toISOString() }), { system: true, silent: true });
      Auth._audit('iniciar sesión');
      VG.store.set({ user: u, theme: u.tema || 'light' });
      Auth.startInactivityWatch();
      VG.events.emit('auth.login', { user: u });
      return u;
    },

    logout() {
      if (current) Auth._audit('cerrar sesión');
      current = null;
      sessionStorage.removeItem(SESSION_KEY);
      clearInterval(lockTimer);
      VG.store.set({ user: null });
      VG.events.emit('auth.logout', {});
    },

    /** Restaura la sesión de la pestaña (sobrevive a recargas, no a cerrar el navegador). */
    restore() {
      const id = sessionStorage.getItem(SESSION_KEY);
      const u = id && VG.db.get('usuario', id);
      if (u && u.estado !== 'inactivo') {
        current = u;
        VG.store.set({ user: u, theme: u.tema || 'light' });
        Auth.startInactivityWatch();
        return u;
      }
      return null;
    },

    /** Crea un usuario con PIN hasheado. */
    async createUser(data, pin, opts) {
      const id = data.id || U.uid('usr_');
      const pinHash = await hashPin(id, pin);
      return VG.db.save('usuario', Object.assign({ estado: 'activo', tema: 'light' }, data, { id, pinHash }), opts);
    },
    async setPin(userId, pin) {
      const u = VG.db.get('usuario', userId);
      return VG.db.save('usuario', Object.assign({}, u, { pinHash: await hashPin(userId, pin) }));
    },

    /** Bloqueo por inactividad. */
    startInactivityWatch() {
      clearInterval(lockTimer);
      lastActivity = Date.now();
      lockTimer = setInterval(() => {
        const min = VG.store.config().alertas.inactividadMin || 15;
        if (current && !locked && Date.now() - lastActivity > min * 60000) {
          locked = true;
          VG.events.emit('auth.locked', { user: current });
        }
      }, 15000);
    },
    touch() { lastActivity = Date.now(); },
    async unlock(pin) {
      const h = await hashPin(current.id, pin);
      if (h !== current.pinHash) throw new Error('PIN incorrecto.');
      locked = false; lastActivity = Date.now();
      VG.events.emit('auth.unlocked', {});
    },

    _audit(accion) {
      const a = { id: U.uid('au_'), fecha: new Date().toISOString(), usuarioId: current?.id, usuario: current?.nombre, accion, entidad: 'sesion', entidadLabel: 'Sesión', descripcion: '' };
      VG.db.save('auditoria', a, { system: true, silent: true });
    }
  };

  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(ev => window.addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
  VG.auth = Auth;
})(window.VG);
