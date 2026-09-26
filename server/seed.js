export function seedVehicles(now = Date.now()) {
  const images = ['photo-1621007947382-bb3c3994e3fb','photo-1552519507-da3b142c6e3d','photo-1503376780353-7e6692767b70','photo-1549317661-bd32c8ce0db2','photo-1502877338535-766e1452684a'];
  const rows = [['Toyota','Corolla',2022,78000,'green','Sedán'],['Chevrolet','Camaro',2020,115000,'yellow','Deportivo'],['Porsche','911',2019,240000,'green','Deportivo'],['Honda','Civic',2021,65000,'red','Sedán'],['Ford','Escape',2023,95000,'yellow','SUV'],['Toyota','RAV4',2022,125000,'green','SUV']];
  return Object.fromEntries(rows.map(([brand,model,year,base,damage,type],i) => {
    const id = `GT-${1041+i}`;
    return [id, {id,brand,model,year,base:base*100,damage,type,engine:i===1?'3.6 L':'2.0 L',transmission:'Automática',fuel:'Gasolina',drive:'FWD',cylinders:i===1?6:4,photos:images.map((p,j)=>`https://images.unsplash.com/${images[(i+j)%images.length]}?auto=format&fit=crop&w=1200&q=80`),startsAt:now-3600000,endsAt:now+(i+1)*7200000,current:0,bidCount:0,ownerId:'demo-seller',winnerId:null}];
  }));
}
