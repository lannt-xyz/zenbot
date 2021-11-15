const { clearInterval } = require('timers');

var minimist = require('minimist')
  , n = require('numbro')
  , path = require('path')
  , moment = require('moment')
  , objectifySelector = require('../lib/objectify-selector')
  , engineFactory = require('../lib/engine')
  , _ = require('lodash')
  , notify = require('../lib/notify')
  , { formatAsset, formatCurrency } = require('../lib/format')
  , express = require('express')
  , app = express()
  , random_port = require('random-port');

var notifier = null
var commandExecuting = false

function execute(s, conf, selector, command, retryTimes) {
  
  if (commandExecuting) {
    // retry to execute command for ten times.
    if (retryTimes >= 10) {
      return
    }

    // retry after 10s
    setTimeout(() => {
      console.log('[API]', 'conflict with the previous command and try again with:', selector.normalized)
      var increment = retryTimes + 1
      execute(s, conf, selector, command, increment)
    }, 10000)

    console.log('[API]', 'retry times exceed limit. STOP!')
    return
  }
  commandExecuting = true

  conf.notifiers = {}
  var so = s.options
  so.selector = selector
  so.stats = true
  var checkOrderInterval = null
  var engine = engineFactory(s, conf)
  engine.executeSignal(command, function (err, order) {
    if (err) {
      console.error('[API]', 'error when execute command:', err)
      process.exit()
    }
    if (!order) {
      console.error('[API]', 'order unsuccess!')
      process.exit()
    }

    if (order.status === 'done') {
      let time = new Date(order.done_at).getTime()
      let asset_qty = formatAsset(order.size, s.asset)
      let currency_price = formatCurrency(order.price, s.currency)
      let total_price = formatCurrency(order.size * order.price, s.currency)
      let completion_time = moment(time).format('YYYY-MM-DD HH:mm:ss')
      let order_complete = `\n${command} order completed at ${completion_time}:\n\n` +
        `${asset_qty} at ${currency_price}\n` +
        `total ${total_price}\n`
      console.log('[API]', (order_complete).cyan)
      pushMessage(`${command} ${s.exchange.name.toUpperCase()}`, order_complete, so)
    }

    commandExecuting = false

    if (checkOrderInterval) {
      clearInterval(checkOrderInterval)
    }
  }, null)

  function pushMessage(title, message, so) {
    if (!notifier) {
      return
    }
    if (so.mode === 'live' || so.mode === 'paper') {
      notifier.pushMessage(title, message)
    }
  }

  function checkOrder() {
    if (s.api_order) {
      s.exchange.getQuote({ product_id: s.product_id }, function (err, quote) {
        if (err) {
          throw err
        }
        console.log('[API]', 'order status: '.grey + s.api_order.status.green + ', ask: '.grey + n(s.api_order.price).format('0.00000000').yellow + ', '.grey + n(s.api_order.price).subtract(quote.ask).format('0.00000000').red + ' above best ask, '.grey + n(s.api_order.filled_size).divide(s.api_order.size).format('0.0%').green + ' filled'.grey)
      })
    }
    else {
      console.log('[API]', 'placing order...')
    }
  }
  checkOrderInterval = setInterval(checkOrder, conf.order_poll_time)
}

function startApi(baseS, baseConf) {

  var conf = Object.assign({}, baseConf)
  var s = Object.assign({}, baseS)
  var apiConf = conf.apiSignal
  const router = express.Router()

  let commandHandle = function (ticker, action) {

    var signalCommand = null;
    if (action.toUpperCase() === 'SELL') {
      signalCommand = 'sell'
    }
    else if (action.toUpperCase() === 'BUY') {
      signalCommand = 'buy'
    }

    if (!signalCommand) {
      console.log('[API]', 'invalid action: ', action)
      return
    }

    ticker = ticker.toUpperCase()
    console.log('[API]', 'Start to execute strategy signal: ', signalCommand, ', ticker', ticker)
    var so = s.options
    var currency = so.selector.currency
    var previousAsset = so.selector.asset
    var asset = ticker.replace(currency, '')
    var newNormalizedSelector = so.selector.normalized
    newNormalizedSelector = newNormalizedSelector.replace(previousAsset, asset)
    var newSelector = objectifySelector(newNormalizedSelector)
    execute(s, conf, newSelector, signalCommand, 0)
  }

  let startServer = function (port, ip, apiContext) {

    router.post('/signal', function (req, res) {
      var data = req.body
      console.log('[API]', 'signal recieved:', data)
      commandHandle(data.asset, data.action)
      res.status(200)
      res.send('')
    })

    app.use(express.json())
    app.use('/' + apiContext, router)

    var url = ''
    if (ip && ip !== '0.0.0.0') {
      app.listen(port, ip)
      url = ip + ':' + port + '/' + apiContext
    } else {
      app.listen(port)
      url = require('ip').address() + ':' + port + '/' + apiContext
    }
    console.log('API Signal running on http://' + url)
  }

  if (!apiConf.port || apiConf.port === 0) {
    random_port({ from: 30000 }, function (port) {
      startServer(port, apiConf.ip, apiConf.context)
    })
  } else {
    startServer(apiConf.port, apiConf.ip, apiConf.context)
  }
}

module.exports = function (program, conf) {
  program
    .command('api-trade [selector]')
    .allowUnknownOption()
    .description('run trading bot against live market data')
    .option('--conf <path>', 'path to optional conf overrides file')
    .option('--strategy <name>', 'strategy to use', String, conf.strategy)
    .option('--order_type <type>', 'order type to use (maker/taker)', /^(maker|taker)$/i, conf.order_type)
    .option('--paper', 'use paper trading mode (no real trades will take place)', Boolean, false)
    .option('--manual', 'watch price and account balance, but do not perform trades automatically', Boolean, false)
    .option('--reverse', 'use this and all your signals(buy/sell) will be switch! TAKE CARE!', Boolean, false)
    .option('--non_interactive', 'disable keyboard inputs to the bot', Boolean, false)
    .option('--filename <filename>', 'filename for the result output (ex: result.html). "none" to disable', String, conf.filename)
    .option('--currency_capital <amount>', 'for paper trading, amount of start capital in currency', Number, conf.currency_capital)
    .option('--asset_capital <amount>', 'for paper trading, amount of start capital in asset', Number, conf.asset_capital)
    .option('--avg_slippage_pct <pct>', 'avg. amount of slippage to apply to paper trades', Number, conf.avg_slippage_pct)
    .option('--buy_pct <pct>', 'buy with this % of currency balance', Number, conf.buy_pct)
    .option('--deposit <amt>', 'absolute initial capital (in currency) at the bots disposal (previously --buy_max_amt)', Number, conf.deposit)
    .option('--sell_pct <pct>', 'sell with this % of asset balance', Number, conf.sell_pct)
    .option('--markdown_buy_pct <pct>', '% to mark down buy price', Number, conf.markdown_buy_pct)
    .option('--markup_sell_pct <pct>', '% to mark up sell price', Number, conf.markup_sell_pct)
    .option('--order_adjust_time <ms>', 'adjust bid/ask on this interval to keep orders competitive', Number, conf.order_adjust_time)
    .option('--order_poll_time <ms>', 'poll order status on this interval', Number, conf.order_poll_time)
    .option('--sell_stop_pct <pct>', 'sell if price drops below this % of bought price', Number, conf.sell_stop_pct)
    .option('--buy_stop_pct <pct>', 'buy if price surges above this % of sold price', Number, conf.buy_stop_pct)
    .option('--profit_stop_enable_pct <pct>', 'enable trailing sell stop when reaching this % profit', Number, conf.profit_stop_enable_pct)
    .option('--profit_stop_pct <pct>', 'maintain a trailing stop this % below the high-water mark of profit', Number, conf.profit_stop_pct)
    .option('--sell_cancel_pct <pct>', 'cancels the sale if the price is between this percentage (for more or less)', Number, conf.sell_cancel_pct)
    .option('--max_sell_loss_pct <pct>', 'avoid selling at a loss pct under this float', conf.max_sell_loss_pct)
    .option('--max_buy_loss_pct <pct>', 'avoid buying at a loss pct over this float', conf.max_buy_loss_pct)
    .option('--max_slippage_pct <pct>', 'avoid selling at a slippage pct above this float', conf.max_slippage_pct)
    .option('--rsi_periods <periods>', 'number of periods to calculate RSI at', Number, conf.rsi_periods)
    .option('--poll_trades <ms>', 'poll new trades at this interval in ms', Number, conf.poll_trades)
    .option('--currency_increment <amount>', 'Currency increment, if different than the asset increment', String, null)
    .option('--keep_lookback_periods <amount>', 'Keep this many lookback periods max. ', Number, conf.keep_lookback_periods)
    .option('--exact_buy_orders', 'instead of only adjusting maker buy when the price goes up, adjust it if price has changed at all')
    .option('--exact_sell_orders', 'instead of only adjusting maker sell when the price goes down, adjust it if price has changed at all')
    .option('--use_prev_trades', 'load and use previous trades for stop-order triggers and loss protection')
    .option('--min_prev_trades <number>', 'minimum number of previous trades to load if use_prev_trades is enabled, set to 0 to disable and use trade time instead', Number, conf.min_prev_trades)
    .option('--disable_stats', 'disable printing order stats')
    .option('--reset_profit', 'start new profit calculation from 0')
    .option('--use_fee_asset', 'Using separated asset to pay for fees. Such as binance\'s BNB or Huobi\'s HT', Boolean, false)
    .option('--run_for <minutes>', 'Execute for a period of minutes then exit with status 0', String, null)
    .option('--interval_trade <minutes>', 'The interval trade time', Number, conf.interval_trade)
    .option('--quarentine_time <minutes>', 'For loss trade, set quarentine time for cancel buys', Number, conf.quarentine_time)
    .option('--debug', 'output detailed debug info')
    .action(function (selector, cmd) {
      var raw_opts = minimist(process.argv)
      var s = { options: JSON.parse(JSON.stringify(raw_opts)) }
      var so = s.options
      if (so.run_for) {
        var botStartTime = moment().add(so.run_for, 'm')
      }
      if (!so.interval_trade) {
        so.interval_trade = 10
      }
      if (!so.quarentine_time) {
        so.quarentine_time = 0
      }
      delete so._
      if (cmd.conf) {
        var overrides = require(path.resolve(process.cwd(), cmd.conf))
        Object.keys(overrides).forEach(function (k) {
          so[k] = overrides[k]
        })
      }
      Object.keys(conf).forEach(function (k) {
        if (typeof cmd[k] !== 'undefined') {
          so[k] = cmd[k]
        }
      })
      so.currency_increment = cmd.currency_increment
      so.keep_lookback_periods = cmd.keep_lookback_periods
      so.use_prev_trades = (cmd.use_prev_trades || conf.use_prev_trades)
      so.min_prev_trades = cmd.min_prev_trades
      so.debug = cmd.debug
      so.stats = !cmd.disable_stats
      so.mode = so.paper ? 'paper' : 'live'
      if (so.buy_max_amt) {
        console.log(('--buy_max_amt is deprecated, use --deposit instead!\n').red)
        so.deposit = so.buy_max_amt
      }
      so.selector = objectifySelector(selector || conf.selector)
      if (!so.min_periods) so.min_periods = 1

      var order_types = ['maker', 'taker']
      if (!order_types.includes(so.order_type)) {
        so.order_type = 'maker'
      }

      startApi(s, conf)
      console.log('[API]', 'trading mode:', so.mode)
      notifier = notify(conf)
    })
}
