const dns = require('dns');
(async () => {
  try {
    dns.setServers(['8.8.8.8','1.1.1.1']);
    console.log('DNS servers set to:', dns.getServers());
    const res = await dns.promises.resolveSrv('_mongodb._tcp.scfc.h6cvmbg.mongodb.net');
    console.log('SRV records via fallback:', JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('Fallback SRV error:', err);
  }
})();
