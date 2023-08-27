

const { google } = require('googleapis');
const keys = require('../intricate-reef-396708-db60098c7969.json');


const client = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth: client });

const google = {

  get_symbol_bars: async function (symbol) { // console.log("url:", url)
    // Update cell A1 with the formula
    await sheets.spreadsheets.values.update({
      spreadsheetId: '1SmDBoJOo9qaYCpp5jFefbDBqtX90sFlk-aGhn04MNi0',
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      resource: {
          values: [['=GOOGLEFINANCE("NASDAQ:GOOG", "all", DATE(2014,1,1), DATE(2014,12,31), "DAILY")']]
      }
    });

    // Wait for the data to be filled
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Read the content of the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: '1SmDBoJOo9qaYCpp5jFefbDBqtX90sFlk-aGhn04MNi0',
      range: 'Sheet1!A1:F22',
    });
    console.log(response.data.values);
  },

}

export defult google