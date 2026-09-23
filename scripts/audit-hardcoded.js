const fs = require('fs');
const path = require('path');

function searchDirectory(dir, term) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        searchDirectory(fullPath, term);
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(term.toLowerCase())) {
            console.log(`[${file}:${idx + 1}] ${line.trim().slice(0, 120)}`);
          }
        });
      }
    }
  });
}

const terms = ['tasks', 'initialSemesters', 'DEFAULT_AMITY', 'Amity', 'seed', 'find', 'findOne', 'localStorage', 'userData'];

terms.forEach(t => {
  console.log(`\n--- SEARCHING FOR: ${t} ---`);
  searchDirectory(path.join(__dirname, '..'), t);
});
