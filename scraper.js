const puppeteer = require('puppeteer');
const fs = require('fs');

async function run() {
  console.log("Iniciando navegador headless para extraer precios de Entel...");
  
  // Cargar inventario de productos desde el HTML o archivo local
  let htmlData = '';
  if (fs.existsSync('qry_ESIMPD1_stock.html')) {
    htmlData = fs.readFileSync('qry_ESIMPD1_stock.html', 'utf8');
  }

  // Extraer SKUs o Descripciones únicas
  const skus = [];
  const regex = /<td[^>]*>([A-Z0-9_\s-]+)<\/td>/gi;
  let match;
  while ((match = regex.exec(htmlData)) !== null) {
    const val = match[1].trim();
    if (val && !val.includes("ITEM_ID") && val.length < 30) {
      if (!skus.includes(val)) skus.push(val);
    }
  }

  console.log(`Se encontraron ${skus.length} SKUs para consultar.`);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const resultPrices = {};

  // Muestra de prueba: procesar los primeros 15 productos
  const itemsToProcess = skus.slice(0, 15);

  for (const item of itemsToProcess) {
    try {
      const url = `https://miportal.entel.cl/personas/catalogo/equipos?q=${encodeURIComponent(item)}`;
      console.log(`Consultando: ${item}...`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Esperar a que cargue el contenido dinámico
      await page.waitForTimeout(2000);

      const priceData = await page.evaluate(() => {
        const offerEl = document.querySelector('.price-offer, .precio-oferta, [data-price-offer], .price');
        const regEl = document.querySelector('.price-regular, .precio-lista, [data-price-regular]');
        
        const offer = offerEl ? parseInt(offerEl.textContent.replace(/\D/g, ''), 10) : null;
        const regular = regEl ? parseInt(regEl.textContent.replace(/\D/g, ''), 10) : null;

        return { offer, regular };
      });

      if (priceData.offer) {
        resultPrices[item] = priceData;
        console.log(`✓ Encontrado: ${item} -> Oferta: $${priceData.offer}`);
      } else {
        console.log(`- Sin precio en catálogo web: ${item}`);
      }
    } catch (err) {
      console.log(`x Error al consultar ${item}:`, err.message);
    }
  }

  await browser.close();

  // Guardar resultados en precios.json
  fs.writeFileSync('precios.json', JSON.stringify(resultPrices, null, 2));
  console.log("Archivo precios.json generado con éxito.");
}

run();
