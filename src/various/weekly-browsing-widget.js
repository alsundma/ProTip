/* weekly-browsing-widget.js
 * ProTip 2015-2018
 * License: GPL v3.0
 */

var weeklyBrowsingWidget = {
    browseLabelCell: function(record) {
        var cell = document.createElement("td");
        cell.style.wordBreak = 'break-all';

        var title
        if (record.title) {
            title = document.createTextNode(record.title)
        } else {
            title = document.createTextNode('')
        }

        cell.appendChild(document.createElement('div').appendChild(title));
        var a = document.createElement('a');
        a.style.display = 'block';
        var linkText
        if (record.url) { // url is optional, for manual subscriptions
            linkText = document.createTextNode(record.url.replace(/http(s?):\/\/(www.|)/, '').substring(0, 40));
        } else {
            linkText = document.createTextNode('');
        }
        a.appendChild(linkText);
        a.className = 'external-link';
        a.href = record.url;
        $(a).click(function() {
            // In a chrome popup
            // the links won't work without the below. Needs to be
            // re-ran on every table creation.
            browser.tabs.create({
                url: $(this).attr('href')
            });
            return false;
        });
        cell.appendChild(a);
        return cell;
    },
    addToBlacklist: function(url) {
        db.put('blacklist', {
            url: url
        });
        db.remove('sites', url);
    },
    subscriptionTotalFiatAmount: function(domIdOutput) {
        return new Promise(function (resolve) {
            db.values('subscriptions').done(function(records) {
                var total = 0.0;
                for (var i in records) {
                    total = total + parseFloat(records[i].amountFiat);
                }
                localStorage['subscriptionTotalFiatAmount'] = total.toFixed(2);
                $('#' + domIdOutput).html(total.toFixed(2));
                resolve(total.toFixed(2));
            });
        });
    },
    subscriptionAmountCell: function(record) {
        var input = document.createElement("input");
        input.type = "number";
        input.setAttribute('step', '0.01');
        input.setAttribute('min', '0.01');
        input.className = "amount-fiat subscription-input";
        input.value = record.amountFiat;
        input.id = record.bitcoinAddress;

        input.addEventListener("change", function() {
            record.amountFiat = this.value;
            db.put('subscriptions', record).done(function(){
                this.subscriptionTotalFiatAmount().then(function(totalFiatAmount){
                    $('#subscription-total-amount').html(totalFiatAmount);
                    // TODO had broken .effect highlight rgb(100, 189, 99) 100 ms
                });
            });
        });

        var cell = document.createElement("td");
        cell.appendChild(input);
        return cell;
    },
    subscriptionBitcoinAddressCell: function(record) {
        var cell = document.createElement("td");
        cell.className = 'blockchain-address';
        cell.appendChild(
            document.createTextNode(
                record.bitcoinAddress.substring(0, 7) + '...'
            )
        );
        return cell;
    },
    subscriptionSwitchCell: function(record) {
        var cell = document.createElement("td");
        cell.style.textAlign = 'center';

        var input = document.createElement("input");
        input.type = "checkbox";
        input.checked = false;
        input.id = record.bitcoinAddress;

        input.className = 'js-switch'; // Switchery.js
        cell.appendChild(input); // append to cell before init Switchery

        new Switchery(input, {
            size: 'small'
        });
        input.addEventListener("change", (function(record, input) {
            return function() {
                var parentTr = input.parentElement.parentElement;
                if (input.checked != true) {
                    db.remove('subscriptions', record.bitcoinAddress);
                    parentTr.style.backgroundColor = 'white';
                    parentTr.style.color = '#000';
                } else {
                    // Allow the unsubscription to be reversed, no need to display confirmation warning
                    // EG. "Do you really want to delete this subscription?"
                    record.bitcoinAddress = record.bitcoinAddress;
                    record.amountFiat = localStorage['defaultSubscriptionAmountFiat'];
                    db.put('subscriptions', record);
                    parentTr.style.backgroundColor = '#eeeeee';
                    parentTr.style.color = '#aaa';
                }
            }
        })(record, input));

        return cell;
    },
    browseIgnoreCell: function(record) {
        var cell = document.createElement("td");

        var removeIcon = document.createElement('span')
        removeIcon.setAttribute('title', "Ignore");
        removeIcon.className = 'glyphicon glyphicon-remove remove-icon ios-orange';

        removeIcon.onclick = function() {
            this.addToBlacklist(record.url);
            $(this.parentElement.parentElement).remove()
            $('#blacklist').effect("highlight", {
                color: '#fc0;'
            }, 1000);
        }
        cell.style.textAlign = 'center';
        cell.appendChild(removeIcon);
        return cell;
    },
    browseAmountCell: function(record) {
        var incidentalAmount = parseFloat(localStorage["incidentalTotalFiat"]);

        var slice = (record.timeOnPage / localStorage['totalTime']).toFixed(2);
        var amountMoney = (slice * incidentalAmount).toFixed(2);
        if(!amountMoney){amountMoney = '0.00'}
        var text = document.createTextNode(amountMoney);

        var cell = document.createElement("td");
        cell.className = 'fiat-amount';
        cell.appendChild(text);
        return cell;
    },
    timeAmountCell: function(record) {
        var min = parseInt(record.timeOnPage) / 60;
        var text = document.createTextNode(min.toFixed(1));
        var cell = document.createElement("td");
        cell.className = 'time-on-page';
        cell.appendChild(text);
        cell.style.textAlign = 'center';
        return cell;
    },
    buildRow: function(record) {
        var row = document.createElement("tr");

        row.appendChild(this.subscriptionSwitchCell(record));
        row.appendChild(this.browseLabelCell(record));
        row.appendChild(this.timeAmountCell(record));
        row.appendChild(this.browseAmountCell(record));
        row.appendChild(this.subscriptionBitcoinAddressCell(record));
        row.appendChild(this.browseIgnoreCell(record));

        return row;
    },
    showEmptyTableNotice: function(domId) {
      var tbody = $('#' + domId);
      var row = document.createElement("tr");
      var cell = document.createElement("td");
      cell.setAttribute("colspan",5);

      var text = document.createTextNode('Sites containing Bitcoin addresses will be collected here.');
      cell.appendChild(text);

      row.appendChild(cell);
      tbody.append(row);
    },
    buildBrowsingTable: function(domId) {
        var tbody = $('#' + domId);
        tbody.empty();

        // The Sites records should be filtered,
        // first, by removing the subscriptions
        // second, by tallying up the total amount
        // of time spent overall.
        // Remove subscriptions for daily browsing.
        db.values('subscriptions').done(function(records) {
            for (var i in records) {
                db.remove('sites', records[i].url);
            }
        });

        // Update the totalTime, this global needs to be updated frequently to allow
        // the correct values for the percentages of each site.
        db.values('sites').done(function(records) {
            localStorage['totalTime'] = 0;
            for (var i in records) {
                if (records[i].timeOnPage) { // it is possible to get a new site record which doesn't yet have a timeOnPage.
                    localStorage['totalTime'] = parseInt(localStorage['totalTime']) + parseInt(records[i].timeOnPage);
                }
            }
        });

        db.from('sites').order('timeOnPage').reverse().list(10).done(function(records) {
            if(records.length < 1){
                this.showEmptyTableNotice('browsing-table');
            }
            for (var i in records) {
                tbody.append(this.buildRow(records[i]));
            }
        });
    }
}

module.exports = weeklyBrowsingWidget