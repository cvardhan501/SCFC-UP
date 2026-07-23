const dns = require('dns').promises;
(async () => {
  try {
    const res = await dns.resolveSrv('_mongodb._tcp.scfc.h6cvmbg.mongodb.net');
    console.log('SRV records:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Error resolving SRV:', err);
    process.exitCode = 1;
  }
})();
