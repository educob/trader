import webdriver from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

let chrome_driver_ = null

const chromedriver = {

  get: () => {
    if(!!chrome_driver_)
      return chrome_driver_
    try { // server: chromedriver
      const options = new chrome.Options();
      //options.addArguments('--user-data-dir=/home/r2d2/.config/google-chrome')
      //options.addArguments('--profile-directory=Default')
      //options.addArguments("--disable-dev-shm-usage"); // Bypass OS security model
      //options.addArguments("--no-sandbox");
      //options.excludeSwitches('enable-automation');
      //options.addArguments("--headless");

      chrome_driver_ = new webdriver.Builder()
        .forBrowser('chrome')
        // .usingServer('http://localhost:9515')
        .setChromeOptions(options)
        .build();

      return chrome_driver_;   
        
    } catch (error) {
      if (error instanceof webdriver.error.NoSuchSessionError) {
        console.error('WebDriver session no longer exists');
      } else {
        console.error('chrome_driver.get: unexpected error:', error)
      }
    }
  },
}

export default chromedriver;
