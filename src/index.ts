/**
 * @author Fabian Dean Flores
 * @summary A server for a function that returns a screenshot of a BMI growth chart to be used
 * in the Easy BMI app. Puppeteer is used to take the screenshot from a tool provided by the CDC.
 */
import dotenv from 'dotenv';
import express from 'express';
import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import moment from 'moment';
import fs from 'fs';
import QueryString from 'qs';

const app = express();

dotenv.config();

const port = process.env.PORT || 3000;

const baseURL = process.env.BASE_URL;

app.get('/', function (_req, res) {
  res.status(200).send('Example usage: /bmichart?system=english&gender=m&age=184&height=67&weight=160');
});

type RequestQueryValue = string | QueryString.ParsedQs | string[] | QueryString.ParsedQs[] | undefined;

interface BMIParams {
  system: RequestQueryValue;
  gender: RequestQueryValue;
  age: RequestQueryValue;
  height: RequestQueryValue;
  weight: RequestQueryValue;
}

/**
 * Route to take screenshot of BMI growth chart from CDC's website
 */
app.get('/bmichart', async (req, res) => {
  const data: BMIParams = {
    system: req.query.system, // english or metric
    gender: req.query.gender, // m or f
    age: req.query.age, // in months
    height: req.query.height, // in or cm
    weight: req.query.weight, // lbs or kg
  };

  // basic error handling
  for (const prop in data) {
    if (data[prop as keyof typeof data] === 'undefined' || data[prop as keyof typeof data] === '') {
      res.status(500).send('Invalid arguments');
      return;
    }
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process'],
      ...(process.env.EXECUTABLE_PATH_OVERRIDE && { executablePath: process.env.EXECUTABLE_PATH_OVERRIDE }),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
    return;
  }
  // Use an existing page if there is one, otherwise create a new page
  const page = (await browser.pages())?.[0] || (await browser.newPage());
  // Setting viewport large enough to avoid navbar on mobile from overlapping chart
  await page.setViewport({
    width: 800,
    height: 1000,
  });

  // catch all error handling for now
  // error likely due to params being of incorrect types
  try {
    console.log('Connecting to BMI chart image source...');

    const url = `${baseURL}method=${data.system}&gender=${data.gender}&age_y=0&age_m=${data.age}&h${
      data.system === 'metric' ? 'cm' : 'inches'
    }=${data.height}&${data.system === 'metric' ? 'wkg' : 'twp'}=${data.weight}`;

    await page.goto(url, { timeout: 10000, waitUntil: 'domcontentloaded' });

    console.log('Connected to source.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching chart');
    return;
  }

  const selector = process.env.SELECTOR || '';
  // wait for selector to load
  await page.waitForSelector(selector, { timeout: 10000 });
  console.log('Found selector.');

  // sleep for 300ms to ensure all elements are rendered
  await new Promise(resolve => setTimeout(resolve, 300));

  const element = await page.$(selector);

  let screenshotPath = `./${moment()}.png`;

  try {
    console.log('Capturing BMI chart...');

    if (element === null) {
      throw new Error('Element not found');
    }

    await element.screenshot({
      path: screenshotPath,
    }); // take screenshot of chart
    await browser.close();
    console.log('Captured BMI chart');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error fetching chart');
    return;
  }

  let doc;
  try {
    console.log('Generating PDF...');
    doc = await generatePDF(data, screenshotPath);
    console.log('Generated PDF.');
    doc.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating PDF');
  } finally {
    console.log('Deleting temporary file...');
    fs.unlink(screenshotPath, () => {
      console.log(`File (\'${screenshotPath}\') deleted.`);
    });
  }
});

const generatePDF = async (data: BMIParams, path: string) => {
  // Create a document
  const doc = new PDFDocument();
  // Embed a font, set the font size, and render some text
  doc
    .font('Times-Roman')
    .fontSize(14)
    .text(
      `Date: ${moment().format('MM/DD/YYYY')} | Age: ${Math.floor(Number(data.age) / 12)} yrs ${
        Number(data.age) % 12
      } mos | Weight: ${data.weight} ${data.system === 'english' ? 'lbs' : 'kg'} | Height: ${data.height} ${
        data.system === 'english' ? 'in' : 'cm'
      }`,
    );

  // Add an image, constrain it to a given size, and center it vertically and horizontally
  doc.image(path, 10, 100, {
    fit: [600, 650],
    align: 'center',
    valign: 'center',
  });

  doc.end();

  return doc;
};

app.listen(port, () => console.log(`Listening on port ${port}`));
