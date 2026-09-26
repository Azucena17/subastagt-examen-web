import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBid, minimumBid, publicVehicle, validateVehicle } from '../server/domain.js';
import { seedVehicles } from '../server/seed.js';
const now=Date.now();
const vehicle=Object.values(seedVehicles(now))[0];
test('primera oferta permite el monto base y luego exige 10 %',()=>{
  assert.equal(minimumBid(vehicle),vehicle.base);
  const first=placeBid(vehicle,'u1',vehicle.base,now);
  assert.throws(()=>placeBid(first,'u2',first.current,now));
  assert.throws(()=>placeBid(first,'u2',minimumBid(first)-1,now));
  const next=placeBid(first,'u2',minimumBid(first),now);
  assert.equal(next.winnerId,'u2');assert.equal(next.bidCount,2);
});
test('rechaza ofertas antes del inicio, al cerrar, del propietario y fracciones de centavo',()=>{
  assert.throws(()=>placeBid(vehicle,'u1',vehicle.base,vehicle.startsAt-1));
  assert.throws(()=>placeBid(vehicle,'u1',vehicle.base,vehicle.endsAt));
  assert.throws(()=>placeBid(vehicle,vehicle.ownerId,vehicle.base,now));
  assert.throws(()=>placeBid(vehicle,'u1',vehicle.base+.5,now));
});
test('la respuesta pública no revela identidad de otros ofertantes',()=>{
  const first=placeBid(vehicle,'secret-user',vehicle.base,now);
  const second=placeBid(first,'another-secret',minimumBid(first),now);
  const publicData=publicVehicle(second,'secret-user');
  assert.equal(publicData.isWinning,false);assert.equal(publicData.myBid,vehicle.base);
  assert.equal('winnerId' in publicData,false);assert.equal('ownerId' in publicData,false);assert.equal('bidderAmounts' in publicData,false);
  assert.equal(JSON.stringify(publicData).includes('another-secret'),false);
});
test('publicación exige fotos distintas, fechas y ficha completa',()=>{
  const valid={...vehicle,startsAt:now+60000};
  assert.equal(validateVehicle(valid,now).brand,'Toyota');
  assert.throws(()=>validateVehicle({...valid,photos:valid.photos.slice(0,4)},now));
  assert.throws(()=>validateVehicle({...valid,photos:Array(5).fill(valid.photos[0])},now));
  assert.throws(()=>validateVehicle({...valid,engine:''},now));
  assert.throws(()=>validateVehicle({...valid,endsAt:now-1},now));
});
