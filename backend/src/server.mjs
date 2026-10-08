import { openDatabase } from './database.mjs';
import { createApp } from './app.mjs';
import { expireReservations } from './reservations.mjs';
const db = openDatabase();
expireReservations(db);
const expiryTimer=setInterval(()=>{try{expireReservations(db);}catch(error){console.error('Reservation expiry failed:',error);}},30_000);
expiryTimer.unref();
const port = Number(process.env.PORT || 3001);
const server = createApp(db).listen(port,'localhost',() => console.log(`Rematerial API is ready at http://localhost:${port}`));
server.on('error', error => { console.error(error.message); db.close(); process.exitCode=1; });
function shutdown() { clearInterval(expiryTimer);server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
