
const { MongoClient } = require('mongodb')


describe('After Message', () => {
  let db

  beforeAll( async() =>  {
    //db = await core.db()
  })

  beforeEach( async() =>  {
    //await core.reset()
  }, 30000)

  afterAll( async() => {
    //await db.collection('address').deleteMany( { name: 'Trust BackAddress: Bob:' } )
    //await core.dbClose()
  });

  it('Should test something', async () => {
    console.log("Starting test")
    expect(true).toBeTruthy()
  }, 100000)

});


