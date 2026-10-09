const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  console.log("Iniciando scraper...");
  
  let htmlData = '';
  if (fs.existsSync('qry_ESIMPD1_stock.html')) {
    htmlData = fs.readFileSync('qry_ESIMPD1_stock.html', 'utf8');
  }

  const items = [];
  const regexRow = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  let match;
  
  while ((match = regexRow.exec(htmlData)) !== null) {
    const rowHtml = match[0];
    const cells = [];
    const regexCell = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cMatch;
    while ((cMatch = regexCell.exec(rowHtml)) !== null) {
      cells.push(cMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    if (cells.length >= 2) {
      const sku = cells[0];
      const desc = cells[1];
      if (sku && sku !== 'ITEM_ID') {
        items.push({ sku, desc });
      }
    }
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Navegar a la sección principal de celulares para cargar datos generales
  const catalogUrl = 'https://miportal.entel.cl/personas/catalogo/celulares';
  console.log("Cargando catálogo principal...");
  
  try {
    await page.goto(catalogUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
  } catch(e) {
    console.log("Error al cargar catálogo:", e.message);
  }

  const resultPrices = {};

  // Extraer todos los precios visibles en el catálogo general
  const scrapedData = await page.evaluate(() => {
    const data = {};
    const cards = document.querySelectorAll('div, article, section');
    cards.forEach(card => {
      const text = card.innerText || '';
      if (text.includes('$')) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const priceMatches = text.match(/\$\s*[\d\.]+/g);
        if (priceMatches && priceMatches.length > 0) {
          const offer = parseInt(priceMatches[0].replace(/\D/g, ''), 10);
          const regular = priceMatches[1] ? parseInt(priceMatches[1].replace(/\D/g, ''), 10) : null;
          
          lines.forEach(line => {
            if (line.length > 5 && line.length < 60 && !line.includes('$')) {
              data[line.toUpperCase()] = { offer, regular };
            }
          });
        }
      }
    });
    return data;
  });

  // Mapear los precios encontrados con los SKUs del inventario por coincidencia de texto
  items.forEach(item => {
    const cleanDesc = item.desc.replace(/^APL\s+|^APPLE\s+|^SAMSUNG\s+/i, '').trim().toUpperCase();
    for (let key in scrapedData) {
      if (key.includes(cleanDesc) || cleanDesc.includes(key)) {
        resultPrices[item.sku] = scrapedData[key];
        break;
      }
    }
  });

  await browser.close();

  fs.writeFileSync('precios.json', JSON.stringify(resultPrices, null, 2));
  console.log(`Proceso finalizado. Total SKUs vinculados: ${Object.keys(resultPrices).length}`);
}

run();
