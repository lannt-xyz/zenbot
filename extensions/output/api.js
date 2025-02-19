module.exports = function api () {
  let express = require('express')
  let app = express()
  let random_port = require('random-port')
  let path = require('path')
  let moment = require('moment')
  const router = express.Router()

  let run = function(reporter, tradeObject) {
    if (!reporter.port || reporter.port === 0) {
      random_port({from: 20000}, function(port) {
        startServer(port, reporter.ip, reporter.context, tradeObject)
      })
    } else {
      startServer(reporter.port, reporter.ip, reporter.context, tradeObject)
    }
  }

  let objectWithoutKey = (object, key) => {
    // eslint-disable-next-line no-unused-vars
    const {[key]: deletedKey, ...otherKeys} = object
    return otherKeys
  }

  // set up rate limiter: maximum of fifty requests per minute
  let RateLimit = require('express-rate-limit');
  let limiter = new RateLimit({
    windowMs: 1*60*1000, // 1 minute
    max: 50
  });

  let startServer = function(port, ip, apiContext, tradeObject) {
    tradeObject.port = port
    tradeObject.context = apiContext

    app.set('views', path.join(__dirname+'/../../templates'))
    app.set('view engine', 'ejs')

    app.use(limiter);
    app.use('/assets', express.static(__dirname+'/../../templates/dashboard_assets'))
    app.use('/assets-wp', express.static(__dirname+'/../../dist/'))
    app.use('/assets-zenbot', express.static(__dirname+'/../../assets'))

    router.get('/', function (req, res) {
      app.locals.moment = moment
      app.locals.deposit = tradeObject.options.deposit
      let datas = JSON.parse(JSON.stringify(objectWithoutKey(tradeObject, 'options'))) // deep copy to prevent alteration
      res.render('dashboard', datas)
    })

    router.get('/trades', function (req, res) {
      res.send(objectWithoutKey(tradeObject, 'options'))
    })

    router.get('/stats', function (req, res) {
      res.sendFile(path.join(__dirname+'../../../stats/index.html'))
    })

    router.get('/summary', function (req, res) {
      app.locals.moment = moment
      app.locals.deposit = tradeObject.options.deposit
      let datas = JSON.parse(JSON.stringify(objectWithoutKey(tradeObject, 'options')))
      res.render('summary', datas)
    })

    router.get('/signal', function(req, res) {
      tradeObject.apiSignal = req.query.action
      res.status(200)
      res.send('')
    })

    app.use('/' + apiContext, router)

    if (ip && ip !== '0.0.0.0') {
      app.listen(port, ip)
      tradeObject.url = ip + ':' + port + '- api context: ' + apiContext
    } else {
      app.listen(port)
      tradeObject.url = require('ip').address() + ':' + port + '- api context: ' + apiContext
    }
    console.log('Web GUI running on http://' + tradeObject.url)
  }

  return {
    run: run
  }
}
