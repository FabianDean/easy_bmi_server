/**
 * @author Fabian Dean Flores
 * @summary A server for a function that returns a screenshot of a BMI growth chart to be used
 * in the Easy BMI app. Puppeteer is used to take the screenshot from a tool provided by the CDC.
 */
require('dotenv').config()
const express = require('express');
const puppeteer = require('puppeteer');
const PDFDocument = require('pdfkit');
const moment = require('moment');
const tmp = require('tmp');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

const baseURL = process.env.BASE_URL;

app.get('/', function (req, res) {
    res.status(200).send('Example usage: /bmichart?system=english&gender=m&age=184&height=67&weight=160');
});

/**
 * Route to take screenshot of BMI growth chart from CDC's website
 */
app.get('/bmichart', async (req, res) => {
    const data = {
        system: req.query.system,   // english or metric
        gender: req.query.gender,   // m or f
        age: req.query.age,         // in months
        height: req.query.height,   // in or cm
        weight: req.query.weight,   // lbs or kg
    }

    // basic error handling
    for (const prop in data) {
        if (data[prop] === 'undefined' || data[prop] === '') {
            res.status(500).send('Invalid arguments');
            return;
        }
    }
    const selector = process.env.SELECTOR;
    const selectorToRemove = process.env.SELECTOR_TO_REMOVE;

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ],
        });
    } catch (error) {
        res.status(500).send('Internal server error');
        return;
    }
    const page = await browser.newPage();

    // catch all error handling for now
    // error likely due to params being of incorrect types
    try {
        console.log("Connecting to BMI chart image source...")
        await page.goto(`${baseURL}method=${data.system}&gender=${data.gender}&age_y=0&age_m=${data.age}&h${data.system === 'metric' ? 'cm' : 'inches'}=${data.height}&${data.system === 'metric' ? 'wkg' : 'twp'}=${data.weight}`,
            { timeout: 60000, waitUntil: 'domcontentloaded' });
        console.log("Connected to source.")
    } catch {
        res.status(500).send('Error fetching chart');
        return;
    }
    // wait for selector to load
    await page.waitForSelector(selector);
    await page.waitForSelector(selectorToRemove);
    const element = await page.$(selector);

    // remove a certain element from the DOM that covers part of the chart
    await page.evaluate((selectorToRemove) => {
        const el = document.querySelector(selectorToRemove);
        el.parentElement.removeChild(el);
    }, selectorToRemove);

    let screenshotPath = `./${moment()}.png`;

    try {
        console.log("Capturing BMI chart...");
        await element.screenshot({ path: screenshotPath }); // take screenshot of chart
        await browser.close();
        console.log("Captured BMI chart");
    } catch (error) {
        res.status(500).send('Error fetching chart');
        return;
    }
    let doc;
    try {
        console.log("Generating PDF...");
        doc = await generatePDF(data, screenshotPath);
        console.log("Generated PDF.");
        (doc).pipe(res);
    } catch (error) {
        res.status(500).send('Error generating PDF');
    } finally {
        console.log("Deleting temporary file...");
        fs.unlink(screenshotPath, () => console.log(`File (\'${screenshotPath}\') deleted.`));
    }
    // res.setHeader('Content-Type', 'application/pdf');
});

const generatePDF = async (data, path) => {
    // Create a document
    const doc = new PDFDocument();
    // Embed a font, set the font size, and render some text
    doc
        .font('Times-Roman')
        .fontSize(14)
        .text(`Date: ${moment().format('MM/DD/YYYY')} | Age: ${Math.floor(parseInt(data.age) / 12)} yrs ${parseInt(data.age) % 12} mos | Weight: ${data.weight} ${data.system === 'english' ? 'lbs' : 'kg'} | Height: ${data.height} ${data.system === 'english' ? 'in' : 'cm'}`);

    // Add an image, constrain it to a given size, and center it vertically and horizontally
    doc.image(path, 10, 100, {
        fit: [600, 650],
        align: 'center',
        valign: 'center'
    });

    doc.end();

    return doc;
};

app.listen(port, () => console.log(`Listening on port ${port}`));
