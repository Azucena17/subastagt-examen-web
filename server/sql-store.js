import sql from 'mssql/msnodesqlv8.js';

export async function openSql() {
  const pool=await new sql.ConnectionPool({connectionString:process.env.SQL_CONNECTION_STRING || 'Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=SubastaGT;Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;'}).connect();
  return {
    close:()=>pool.close(),
    async load() {
      const users=await pool.request().query('SELECT Id AS id, Email AS email, FirstName AS name, LastName AS lastName, Phone AS phone, PasswordHash AS password FROM dbo.Users');
      const vehicles=await pool.request().query('SELECT Document FROM dbo.Vehicles');
      return {users:Object.fromEntries(users.recordset.map(u=>[u.email,u])),vehicles:Object.fromEntries(vehicles.recordset.map(r=>{const v=JSON.parse(r.Document);return [v.id,v];}))};
    },
    async addUser(u) {
      await pool.request().input('id',sql.VarChar(64),u.id).input('email',sql.NVarChar(254),u.email).input('name',sql.NVarChar(80),u.name).input('lastName',sql.NVarChar(80),u.lastName).input('phone',sql.NVarChar(80),u.phone).input('password',sql.VarChar(200),u.password).query('INSERT INTO dbo.Users(Id,Email,FirstName,LastName,Phone,PasswordHash) VALUES(@id,@email,@name,@lastName,@phone,@password)');
    },
    async addVehicle(v) {
      await pool.request().input('id',sql.VarChar(64),v.id).input('owner',sql.VarChar(64),v.ownerId).input('document',sql.NVarChar(sql.MAX),JSON.stringify(v)).query('INSERT INTO dbo.Vehicles(Id,OwnerId,Document) VALUES(@id,@owner,@document)');
    },
    async mutate(id,transform) {
      const transaction=new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const result=await new sql.Request(transaction).input('id',sql.VarChar(64),id).query('SELECT Document FROM dbo.Vehicles WITH (UPDLOCK, HOLDLOCK) WHERE Id=@id');
        const old=result.recordset[0]?JSON.parse(result.recordset[0].Document):null;
        const next=transform(old);
        await new sql.Request(transaction).input('id',sql.VarChar(64),id).input('document',sql.NVarChar(sql.MAX),JSON.stringify(next)).query('UPDATE dbo.Vehicles SET Document=@document, UpdatedAt=SYSUTCDATETIME() WHERE Id=@id');
        if(next.bidCount>(old?.bidCount || 0)) await new sql.Request(transaction).input('vehicle',sql.VarChar(64),id).input('uid',sql.VarChar(64),next.winnerId).input('amount',sql.BigInt,next.current).query('INSERT INTO dbo.Bids(VehicleId,UserId,AmountCents) VALUES(@vehicle,@uid,@amount)');
        await transaction.commit();return next;
      } catch(e) {await transaction.rollback();throw e;}
    }
  };
}
