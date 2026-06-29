import fs from 'fs';
import https from 'https';
import path from 'path';

const url = 'https://raw.githubusercontent.com/deldersveld/topojson/master/countries/mexico/mx-ag.json';
// Let's try downloading from a known working source for Mexico states topojson
const WORKING_URL = 'https://raw.githubusercontent.com/deldersveld/topojson/master/countries/mexico/mx-ag.json';
// Actually the whole mexico repo is not there. Let's use a standard one from another repo.
const REAL_WORKING_URL = 'https://raw.githubusercontent.com/PhantomShadow/mexico-map-topojson/master/mexico.json';

const dest = path.join(process.cwd(), 'src', 'assets', 'mexico.json');

console.log(`Downloading Mexico TopoJSON from ${REAL_WORKING_URL}...`);

https.get(REAL_WORKING_URL, (res) => {
    if (res.statusCode !== 200) {
        console.error(`Failed to download: ${res.statusCode}`);
        // If that fails too, let's try a backup:
        const backupUrl = 'https://gist.githubusercontent.com/chilangotech/109038d15a3a2283e5cb19e487103aae/raw/aefadff8120b666aeff252b49dfd410ae513f508/mexico.topojson';
        console.log(`Trying backup URL: ${backupUrl}`);
        https.get(backupUrl, (res2) => {
            if (res2.statusCode !== 200) {
                console.error(`Backup failed: ${res2.statusCode}`);
            } else {
                const file = fs.createWriteStream(dest);
                res2.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('Download complete (Backup).');
                });
            }
        });

        return;
    }

    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('Download complete.');
    });
}).on('error', (err) => {
    console.error(`Error: ${err.message}`);
});
