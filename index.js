/**
 * @author Fabian Dean Flores
 * @summary A server for a function that returns a screenshot of a BMI growth chart to be used
 * in the Easy BMI app. Puppeteer is used to take the screenshot from a tool provided by the CDC.
 */
require('dotenv').config()
const express = require('express');
const puppeteer = require('puppeteer');
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

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // catch all error handling for now
    // error likely due to params being of incorrect types
    try {
        await page.goto(`${baseURL}method=${data.system}&gender=${data.gender}&age_y=0&age_m=${data.age}&h${data.system === 'metric' ? 'cm' : 'inches'}=${data.height}&${data.system === 'metric' ? 'wkg' : 'twp'}=${data.weight}`);
    } catch {
        res.status(500).send('Error fetching chart');
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
    const screenshot = await element.screenshot(); // take screenshot of chart
    await browser.close();

    res.status(200).send(screenshot);
});

app.listen(port, () => `Listening on port ${port}`);
