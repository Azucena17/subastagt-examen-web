import assert from 'node:assert/strict';
import sql from 'mssql/msnodesqlv8.js';
import {openSql} from '../server/sql-store.js';
import {seedVehicles} from '../server/seed.js';
import {placeBid,minimumBid} from '../server/domain.js';
process.loadEnvFile('.env');
const store=await openSql();
const pool=await new sql.ConnectionPool({connectionString:process.env.SQL_CONNECTION_STRING}).connect();
const v={...Object.values(seedVehicles())[0],id:`TEST-${Date.now()}`};
try {
 await store.addVehicle(v);
 const outcomes=await Promise.allSettled([
  store.mutate(v.id,old=>placeBid(old,'demo-user-1',v.base)),
  store.mutate(v.id,old=>placeBid(old,'demo-user-2',v.base))
 ]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 const next=await store.mutate(v.id,old=>placeBid(old,'demo-user-3',minimumBid(old)));
 assert.equal(next.bidCount,2);
 const rows=await pool.request().input('id',sql.VarChar(64),v.id).query('SELECT AmountCents FROM dbo.Bids WHERE VehicleId=@id ORDER BY Id');
 assert.equal(rows.recordset.length,2);assert.equal(Number(rows.recordset[1].AmountCents),minimumBid({...v,current:v.base}));
 console.log('SQL Server: transacciones concurrentes y persistencia de ofertas correctas.');
} finally {
 await pool.request().input('id',sql.VarChar(64),v.id).query('DELETE FROM dbo.Bids WHERE VehicleId=@id; DELETE FROM dbo.Vehicles WHERE Id=@id;');
 await store.close();await pool.close();
}
