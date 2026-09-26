export const fields = ['year','type','brand','model','engine','transmission','fuel','drive','cylinders','damage','photos','base','startsAt','endsAt'];
export const minimumBid = v => v.current ? Math.ceil(v.current * 110 / 100) : v.base;
export function validateVehicle(input, now = Date.now(), editing = false) {
  const v = Object.fromEntries(fields.map(k => [k, input[k]]));
  for (const k of ['type','brand','model','engine','transmission','fuel','drive']) {
    if (typeof v[k] !== 'string' || !v[k].trim() || v[k].length > 80) throw new Error('Completa todos los campos de la ficha técnica.');
    v[k] = v[k].trim();
  }
  if (!Number.isInteger(v.year) || v.year < 1900 || v.year > new Date(now).getFullYear()+2) throw new Error('El año no es válido.');
  if (!Number.isInteger(v.cylinders) || v.cylinders < 0 || v.cylinders > 16) throw new Error('Indica de 0 a 16 cilindros.');
  if (!['green','yellow','red'].includes(v.damage)) throw new Error('Selecciona el estado de daño.');
  if (!Array.isArray(v.photos) || v.photos.length < 5 || v.photos.length > 12 || v.photos.some(p => typeof p !== 'string' || p.length > 2000 || !/^https:\/\//.test(p))) throw new Error('Agrega entre 5 y 12 fotografías con URL HTTPS.');
  if (new Set(v.photos).size < 5) throw new Error('Agrega por lo menos cinco fotografías distintas.');
  if (!Number.isSafeInteger(v.base) || v.base < 100 || v.base > 1e11) throw new Error('El monto base debe ser positivo y tener máximo dos decimales.');
  if (!Number.isSafeInteger(v.startsAt) || !Number.isSafeInteger(v.endsAt) || v.endsAt <= v.startsAt || v.endsAt <= now) throw new Error('El cierre debe ser posterior al inicio y estar en el futuro.');
  if (!editing && v.startsAt < now - 60000) throw new Error('La fecha de inicio no puede estar en el pasado.');
  return v;
}
export function placeBid(v, uid, amount, now = Date.now()) {
  if (!v) throw new Error('Vehículo no encontrado.');
  if (now < v.startsAt) throw new Error('La subasta aún no ha comenzado.');
  if (now >= v.endsAt) throw new Error('Oferta cerrada: terminó el tiempo.');
  if (v.ownerId === uid) throw new Error('No puedes ofertar en tu propia publicación.');
  if (!Number.isSafeInteger(amount) || amount < minimumBid(v) || amount > 1e11) throw new Error('La oferta debe alcanzar el mínimo vigente (incremento del 10 %).');
  return { ...v, current: amount, winnerId: uid, bidCount: (v.bidCount || 0)+1, bidderAmounts: {...v.bidderAmounts,[uid]:amount} };
}
export function publicVehicle(v, uid) {
  const { ownerId, winnerId, bidderAmounts, ...safe } = v;
  return { ...safe, isOwner: !!uid && ownerId === uid, isWinning: !!uid && winnerId === uid, myBid:uid?bidderAmounts?.[uid] || 0:0 };
}
