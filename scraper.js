const puppeteer = require('puppeteer');
const fs = require('fs');

function cleanDescription(desc) {
  if (!desc) return '';
  return desc
    .replace(/^APL\s+/i, '')
    .replace(/^APPLE\s+/i, '')
    .replace(/\bREAC\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function run() {
  console.log("Iniciando scraper de precios de Entel...");
  
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
      if (sku && sku !== 'ITEM_ID' && !desc.toLowerCase().includes('sim card') && !desc.toLowerCase().includes('habilitacion')) {
        items.push({ sku, desc });
      }
    }
  }

  console.log(`Se encontraron ${items.length} equipos para procesar.`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const resultPrices = {};

  // Procesar una muestra amplia de equipos (los primeros 50)
  const toProcess = items.slice(0, 50);

  for (const item of toProcess) {
    try {
      const cleanSearch = cleanDescription(item.desc);
      const url = `https://miportal.entel.cl/personas/catalogo/equipos?q=${encodeURIComponent(cleanSearch)}`;
      console.log(`Buscando SKU ${item.sku} ("${cleanSearch}")...`);
      
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const priceData = await page.evaluate(() => {
        // Selectores de precios en Entel
        const offerEl = document.querySelector('.price-offer, .precio-oferta, [data-price-offer], .price, .offer-price, .p-offer');
        const regEl = document.querySelector('.price-regular, .precio-lista, [data-price-regular], .regular-price, .p-regular');
        
        const offer = offerEl ? parseInt(offerEl.textContent.replace(/\D/g, ''), 10) : null;
        const regular = regEl ? parseInt(regEl.textContent.replace(/\D/g, ''), 10) : null;

        return { offer, regular };
      });

      if (priceData.offer) {
        resultPrices[item.sku] = priceData;
        console.log(`✓ Encontrado: ${item.sku} -> Oferta: $${priceData.offer}`);
      } else {
        console.log(`- Sin precio público para: ${item.sku}`);
      }
    } catch (err) {
      console.log(`x Error en ${item.sku}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('precios.json', JSON.stringify(resultPrices, null, 2));
  console.log("Archivo precios.json generado con éxito:", Object.keys(resultPrices).length, "precios obtenidos.");
}

run();
