var z = require('zero-fill')
  , Phenotypes = require('../../../lib/phenotype')
  , Imap = require('imap')
  , conf = require('../../../conf')
  , emailSignal = null
  , imapListener = null
  , tradingTicker = null;

function initImap(mailSignalOptions) {
  var imap = new Imap({
    user: mailSignalOptions.username,
    password: mailSignalOptions.password,
    host: mailSignalOptions.host,
    port: mailSignalOptions.port,
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false
    }
  });
  var subjectPrefix = mailSignalOptions.subjectPrefix || 'notifier@tradingview: '

  function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
  }

  imap.once('ready', function () {
    console.log("Imap ready");
    openInbox(function (err, box) {
      if (err) throw err;
      imap.on('mail', function (mail) {
        console.log('')
        console.log(mail, ' new email comming')

        imap.openBox('INBOX', true, function (err, box) {
          if (err) throw err;
          var searchConditions = [
            'UNSEEN',
            ['SUBJECT', subjectPrefix]
          ];
          imap.esearch(searchConditions, ['MAX'], function (err, results) {
            if (err) throw err;

            if (results.length == 0) {
              return;
            }

            var fetchOptions = {
              markSeen: true,
              bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
              struct: true
            }
            var f = imap.fetch(results['max'], fetchOptions);
            f.on('message', function (msg, seqno) {
              var prefix = '(#' + seqno + ') ';
              msg.on('body', function (stream, info) {
                var buffer = '';
                stream.on('data', function (chunk) {
                  buffer += chunk.toString('utf8');
                });
                stream.once('end', function () {
                  var mailHeader = Imap.parseHeader(buffer);
                  emailSignal = mailHeader['subject'][0];
                  console.log('Email subject recieved: ', emailSignal)
                });
              });
            });
          });
        });
      });
    });
  });

  imap.once('error', function (err) {
    console.log(err);
  });

  imap.once('end', function () {
    console.log('Connection ended');
  });

  imap.connect();
  return imap;
}


module.exports = {
  name: 'email_signal',
  description: 'Buy when recieve signal from email.',

  getOptions: function () {
    this.option('period', 'period length, same as --period_length', String, '1s')
    this.option('period_length', 'period length, same as --period', String, '1s')

    this.option('no_backfill', 'disable backfill', Boolean, true)
    this.option('subject_prefix', 'Email subject prefix to detect signal', String, 'notifier@tradingview: ')
  },

  calculate: function (s) {

  },

  onPeriod: function (s, cb) {

    // initial options
    if (!imapListener) {
      imapListener = initImap(conf.emailSignal)
      console.log('Imap initail done!')
    }

    if (!tradingTicker) {
      tradingTicker = s.options.selector.asset
      console.log('Trading ticker: ', tradingTicker)
    }

    // email signal received
    if (emailSignal) {
      var strategySignal = null
      // make sure the signal is for the curent trade (correct asset)
      if (emailSignal.includes(tradingTicker)) {
        if (emailSignal.includes('sell')) {
          strategySignal = 'sell'
        }
        else if (emailSignal.includes('buy')) {
          strategySignal = 'buy'
        }
      }

      console.log('Email signal recieved: ', strategySignal)
      // setting signal for strategy
      s.signal = strategySignal
      // reset external signal
      emailSignal = null
    } else {
      // when no signal revieved do not action any thing
      s.signal = null
    }

    cb()
  },

  onReport: function (s) {
    var cols = []
    cols.push(z(s.signal, ' ')[s.signal === false ? 'red' : 'green'])
    return cols
  },

  phenotypes: {
    // -- common
    period_length: Phenotypes.RangePeriod(1, 7200, 's'),
    markdown_buy_pct: Phenotypes.RangeFloat(-1, 5),
    markup_sell_pct: Phenotypes.RangeFloat(-1, 5),
    order_type: Phenotypes.ListOption(['maker', 'taker']),
    sell_stop_pct: Phenotypes.Range0(1, 50),
    buy_stop_pct: Phenotypes.Range0(1, 50),
    profit_stop_enable_pct: Phenotypes.Range0(1, 20),
    profit_stop_pct: Phenotypes.Range(1, 20),

    // -- strategy
    no_backfill: Phenotypes.ListOption([true, false]),
  }
}

