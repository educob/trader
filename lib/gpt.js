// https://github.com/transitive-bullshit/bing-chat
//import { BingChat } from 'bing-chat'
//import { oraPromise } from 'ora'


/*const api = new BingChat({
  cookie: '1vwNRTT_H0NnP2pF2fq6OdULDMPvTifPjduGKVrUFulTH5v3Rnws5g-W6K1Def_m7329OyysKatFNeIAHv7ezHuoiLhzpaXxr6YzbxQ35-KW6zfpN5B_UMECTidHP41sn1SEOK2e69vE8olCAWstAgdm7owBu04P3Z8MH7zPOksgU3Q78UrsJgujY8q4gQ2GNty_GKCBsTXmOLSRsxR3oDw'
})*/


const gpt = {

  ask: async function( prompt) {   
    // openAI
    const res = await  fetch('https://api.openai.com/v1/engines/davinci-codex/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.openAIKey}`,
      },
      body: JSON.stringify({
        prompt,
        max_tokens: 1024,
        temperature: 0,
        n: 1,
        stop: '\n',
      }),
    }).then(response => response.json())
    console.log("res:", res)

    // bingChat
    /*const res = await oraPromise(api.sendMessage(prompt), {
      text: prompt
    })

    //console.log("gpt res:", res)
    return res.text*/
  },

  analyze_news: async function ( company, news ) { return { impact: 'positive', summary: 'short_summary', reason: 'just because' }
    const prompt = `Analyze this news for company ${company} and tell me if you think the price of the shares will be highly impacted either positively or negatively or not really impacted much.
    If you think the price will either be impacted positvely or negatively but not in an important way answer with 'neutral'.

    Please provide your answer in JSON format with the following three properties:
    * impact: possible values for the ‘impact’ field being ‘positive’, ‘negative’, or ‘neutral’
    * summary: A 200 words long summary of the news
    * reason: a 200 maximum long with your logic at deciding the impact.
    Your answer should be just the json format not any extra text.
    '''${news}'''
    `
    return this.ask(prompt)
  },

}



export default gpt;
