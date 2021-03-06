/*======================================================================
 *  Exhibit
 *  http://simile.mit.edu/wiki/Exhibit/API/Exhibit
 *======================================================================
 */
Exhibit.create = function(data, rootTypes) {
    if (data == null) {
        var urls = [];
        var heads = document.documentElement.getElementsByTagName("head");
        for (var h = 0; h < heads.length; h++) {
            var links = heads[h].getElementsByTagName("link");
            for (var l = 0; l < links.length; l++) {
                var link = links[l];
                if (link.rel == "exhibit/data") {
                    urls.push(link.href);
                }
            }
        }
        return Exhibit.createFromFiles(urls, rootTypes);
    } else {
        var exhibit = Exhibit._internalCreate({});

	if (!(data instanceof Array)) {
	    exhibit._dwim_create(data);
	} else {
	    for (var i = 0, specs; specs = data[i]; i++) {
		exhibit._dwim_create(specs);
	    }
	}

        exhibit.setRootTypes(rootTypes);
        return exhibit;
    }
};

Exhibit.createFromFiles = function(urls, rootTypes) {
    var exhibit = Exhibit._internalCreate({});
    exhibit.loadJSON(urls, function() {
        exhibit.setRootTypes(rootTypes);
    });
    return exhibit;
};

Exhibit.createAdvanced = function(configuration, controlDiv, browseDiv, viewDiv) {
    return Exhibit._internalCreate({
        controlDiv:     controlDiv,
        browseDiv:      browseDiv,
        viewDiv:        viewDiv,
        configuration:  configuration
    });
};

Exhibit.protectUI = function(elmt) {
    SimileAjax.DOM.appendClassName(elmt, "exhibit-ui-protection");
};

Exhibit.getAttribute = function(elmt, name) {
    try {
        var value = elmt.getAttribute(name);
        return (value != null) ? value : elmt.getAttribute("ex:" + name);
    } catch (e) {
        return null;
    }
};

Exhibit.showHelp = function(message, url, target) {
    target = (target) ? target : "_blank";
    if (url != null) {
        if (window.confirm(message + "\n\n" + Exhibit.l10n.showDocumentationMessage)) {
            window.open(url, target);
        }
    } else {
        window.alert(message);
    }
};

Exhibit.showJavascriptExpressionValidation = function(message, expression) {
    var target = "_blank";
    if (window.confirm(message + "\n\n" + Exhibit.l10n.showJavascriptValidationMessage)) {
        window.open(Exhibit.validator + "?expresson=" + encodeURIComponent(expression), target);
    }
};

Exhibit.showJsonFileValidation = function(message, url) {
    var target = "_blank";
    if (url.indexOf("file:") == 0) {
        if (window.confirm(message + "\n\n" + Exhibit.l10n.showJsonValidationFormMessage)) {
            window.open(Exhibit.validator, target);
        }
    } else {
        if (window.confirm(message + "\n\n" + Exhibit.l10n.showJsonValidationMessage)) {
            window.open(Exhibit.validator + "?url=" + url, target);
        }
    }
};

Exhibit._internalCreate = function(settings) {
    if (!("controlDiv" in settings) || settings.controlDiv == null) {
        settings.controlDiv = document.getElementById("exhibit-control-panel");
    }
    if (!("browseDiv" in settings) || settings.browseDiv == null) {
        settings.browseDiv = document.getElementById("exhibit-browse-panel");
    }
    if (!("viewDiv" in settings) || settings.viewDiv == null) {
        settings.viewDiv = document.getElementById("exhibit-view-panel");
    }
    if (!("configuration" in settings) || settings.configuration == null) {
        settings.configuration = {};
    }
    
    return new Exhibit._Impl(
        settings.controlDiv, 
        settings.browseDiv, 
        settings.viewDiv, 
        settings.configuration
    );
};

Exhibit.docRoot = "http://simile.mit.edu/wiki/";
Exhibit.validator = "http://simile.mit.edu/babel/validator";

/*==================================================
 *  Exhibit._Impl
 *==================================================
 */
Exhibit._Impl = function(controlDiv, browseDiv, viewDiv, configuration) {
    this._configuration = configuration;
    
    this._exporters = [
        Exhibit.RdfXmlExporter,
        Exhibit.SemanticWikitextExporter,
        Exhibit.ExhibitJsonExporter,
        Exhibit.TSVExporter,
        Exhibit.HTMLExporter
    ];
    if ("exporters" in configuration) {
        this._exporters = this._exporters.concat(configuration.exporters);
    }
    
    this._database = new Exhibit.Database();
    this._engine = new Exhibit.BrowseEngine(this._database, configuration);
    this._controlPanel = new Exhibit.ControlPanel(this, controlDiv, configuration);
    this._browsePanel = new Exhibit.BrowsePanel(this, browseDiv, configuration);
    this._viewPanel = new Exhibit.ViewPanel(this, viewDiv, configuration);
    this._busyIndicator = Exhibit.Theme.createBusyIndicator();
    
    var self = this;
    this._focusID = null;
    this._databaseListener = {
        onAfterLoadingItems: function() {
            self._tryToFocusOnItem();
        }
    };
    this._database.addListener(this._databaseListener);
    
    this._historyListener = {
        onBeforePerform: function(action) {
            if (action.lengthy) {
                self._showBusyIndicator();
            }
        },
        onAfterPerform: function(action) {
            if (action.lengthy) {
                self._hideBusyIndicator();
            }
        },
        onBeforeUndoSeveral: function() {
            self._showBusyIndicator();
        },
        onAfterUndoSeveral: function() {
            self._hideBusyIndicator();
        },
        onBeforeRedoSeveral: function() {
            self._showBusyIndicator();
        },
        onAfterRedoSeveral: function() {
            self._hideBusyIndicator();
        }
    };
    SimileAjax.History.addListener(this._historyListener);
    
    this._parseURL();
};

Exhibit._Impl.prototype.getDatabase = function() { return this._database; };
Exhibit._Impl.prototype.getBrowseEngine = function() { return this._engine; };
Exhibit._Impl.prototype.getBrowsePanel = function() { return this._browsePanel; };
Exhibit._Impl.prototype.getViewPanel = function() { return this._viewPanel; };
Exhibit._Impl.prototype.getControlPanel = function() { return this._controlPanel; };

Exhibit._Impl.prototype.dispose = function() {
    SimileAjax.History.removeListener(this._historyListener);
    this._database.removeListener(this._databaseListener);
};

Exhibit._Impl.prototype._dwim_create = function(data) {
    var showError = function() {
	if( confirm( "Exhibit.create() expects a Javascript object, the\n" +
            "ID of a <data> or <table> element, or an array of either.\n\n" +
            "Do you want to see to the relevant documentation?" ) ) {
            window.open("http://simile.mit.edu/wiki/Exhibit/Creating%2C_Importing%2C_and_Managing_Data", "_blank");
        }
    };

    if (typeof data == "object")
	return this.loadData(data);

    if (typeof data == "string") {
        var elmt = document.getElementById(data);
        if (elmt == null) {
            return showError();
        } else {
            var tagName = elmt.tagName.toLowerCase();
            if (tagName == "data") {
                this.loadDataFromDomNode(elmt);
            } else if (tagName == "table") {
                this.loadDataFromTable(elmt);
            } else {
                showError();
            }
        }
    } else {
        showError();
    }
}

Exhibit._Impl.prototype.setRootTypes = function(rootTypes) {
    if (typeof rootTypes == "string") {
        this.getBrowseEngine().setRootCollection(this.getDatabase().getSubjects(rootTypes, "type"));
    } else if (rootTypes instanceof Array) {
        this.getBrowseEngine().setRootCollection(
            this.getDatabase().getSubjectsUnion(new Exhibit.Set(rootTypes), "type")
        );
    } else {
        this.getBrowseEngine().setRootCollection(this.getDatabase().getAllItems());
    }
};

Exhibit._Impl.prototype.getPermanentLink = function() {
    var state = {};
    
    var engineState = this._engine.getState();
    if (engineState != null) {
        state["browseEngine"] = engineState;
    }
    var browsePanelState = this._browsePanel.getState();
    if (browsePanelState != null) {
        state["browsePanel"] = browsePanelState;
    }
    var viewPanelState = this._viewPanel.getState();
    if (viewPanelState != null) {
        state["viewPanel"] = viewPanelState;
    }
    
    var stateString = this._serializeState(state);
    
    return Exhibit._getURLWithoutQuery() + "?exhibit-state=" + encodeURIComponent(stateString);
};

Exhibit._Impl.prototype.getItemLink = function(itemID) {
    return Exhibit._getURLWithoutQueryAndHash() + "#" + encodeURIComponent(itemID);
};

Exhibit._Impl.prototype.loadJSON = function(urls, fDone) {
    var exhibit = this;
    if (urls instanceof Array) {
        urls = [].concat(urls);
    } else {
        urls = [ urls ];
    }
    
    var fError = function(statusText, status, xmlhttp) {
        Exhibit.showHelp(Exhibit.l10n.failedToLoadDataFileMessage(urls[0]));
        urls.shift();
        fNext();
    };
    
    var fDone2 = function(xmlhttp) {
        try {
            var o = null;
            var url = exhibit.resolveURL(urls[0]);
            try {
                o = eval("(" + xmlhttp.responseText + ")");
            } catch (e) {
                Exhibit.showJsonFileValidation(Exhibit.l10n.badJsonMessage(url, e), url);
            }
            
            if (o != null) {
                exhibit._loadJSON(o, exhibit.getBaseURL(urls[0]));
            }
        } catch (e) {
            SimileAjax.Debug.exception("Exhibit: Error loading next JSON URL", e);
        }
        
        urls.shift();
        fNext();
    };
    
    var fNext = function() {
        if (urls.length > 0) {
            SimileAjax.XmlHttp.get(urls[0], fError, fDone2);
        } else {
            try {
                if (fDone != null) {
                    fDone();
                } else {
                    var browseEngine = exhibit.getBrowseEngine();
                    var database = exhibit.getDatabase();
                    if (browseEngine.getCollectionCount() == 0 &&
                        database.getAllItemsCount() > 0) {
                        browseEngine.setRootCollection(database.getAllItems());
                    }
                }
            } catch (e) {
                SimileAjax.Debug.exception("Exhibit: Error loading next JSON URL", e);
            } finally {
                exhibit._hideBusyIndicator();
            }
        }
    };
    
    exhibit._showBusyIndicator();
    setTimeout(fNext, 0);
};

Exhibit._Impl.prototype.loadJSONP = function(urls, fConvert, fDone) {
    function attachJsonpCallbackName( url ) {
	if (url.indexOf("?") == -1)
	    url += "?";
	var lastChar = url.charAt(url.length-1);
	if (lastChar != "=") {
	    if (lastChar != '&' && lastChar != "?")
		url += "&";
	    url += 'callback=';
	}
	return url;
    }

    function copyObject( o ) {
	var clone = {};
	for (var i in o) {
	    if (!o.hasOwnProperty(i))
		continue;
	    if (typeof o[i] == "object") {
		if (o[i] instanceof Array)
		    clone[i] = o[i].slice(0);
		else
		    clone[i] = arguments.callee(o[i]);
	    } else {
		clone[i] = o[i];
	    }
	}
	return clone;
    }

    var exhibit = this, feeds = [], converted = [], singleFeed = false;
    if (urls instanceof Array) {
        urls = [].concat(urls);
    } else {
        singleFeed = true;
        urls = [ urls ];
    }
    if (fConvert && !(fConvert instanceof Array)) {
	fConvert = [fConvert];
	for (var i = 1; i < urls.length; i++) {
	    fConvert[i] = fConvert[0];
	}
    }

    var beforeCount = exhibit.getDatabase().getAllItemsCount();

    var script;
    var next = Exhibit.callbacks.next || 1;
    var callbackName = "cb" + next.toString(36);
    Exhibit.callbacks.next = next + 1;

    Exhibit.callbacks[callbackName] = function(json) {
        var url = urls.shift();
	if (script && script.parentNode)
	    script.parentNode.removeChild(script);
	if (fDone)
	    feeds.push(copyObject(json));
	if (fConvert)
	    json = fConvert.shift().call(exhibit, json, url);
	converted.push(json);
        try {
            exhibit._loadJSON(json, url);
        } catch (e) {
            SimileAjax.Debug.exception("Exhibit: Error loading JSONP data from " + url, e);
        }
        fNext();
    };

    var fNext = function() {
        if (urls.length) {
	    var url = attachJsonpCallbackName(urls[0]) + "Exhibit.callbacks." +
		     callbackName;
            script = SimileAjax.includeJavascriptFile(document, url);
        } else {
	    delete Exhibit.callbacks[callbackName];
            try {
                if (fDone) {
		    if (singleFeed)
			fDone( feeds[0], converted[0] );
		    else
			fDone( feeds, converted );
                } else {
                    var browseEngine = exhibit.getBrowseEngine();
                    var database = exhibit.getDatabase();
                    if (beforeCount == 0 && database.getAllItemsCount() > 0) {
                        browseEngine.setRootCollection(database.getAllItems());
                    }
                }
            } catch (e) {
                SimileAjax.Debug.exception("Exhibit: Error loading JSONP data", e);
            } finally {
                exhibit._hideBusyIndicator();
            }
        }
    };

    exhibit._showBusyIndicator();
    setTimeout(fNext, 10);
    return Exhibit.callbacks[callbackName];
};

Exhibit._Impl.prototype.loadGoogleSpreadsheetsData = function(urls, fDone) {
    if (typeof urls == "string")
	urls = [urls];
    for (var i = 0, url; url = urls[i]; i++) {
	urls[i] += "?alt=json-in-script";
    }
    this.loadJSONP(urls, this._googleSpreadsheetsConverter, fDone);
}

Exhibit._Impl.prototype.loadDataFromDomNode = function(node) {
    window.alert("not yet implemented");
};

Exhibit._Impl.prototype.loadDataFromTable = function(table) {
    var textOf = function( n ) { return n.textContent || n.innerText || ""; };
    var readAttributes = function( node, attributes ) {
	var result = {}, found = false, attr, value, i;
	for( i = 0; attr = attributes[i]; i++ ) {
	    value = Exhibit.getAttribute( node, attr );
	    if( value ) {
		result[attr] = value;
		found = true;
	    }
	}
	return found && result;
    }

    if( typeof table == "string" )
	table = document.getElementById( table );
    table.style.display = "none"; // as we are replacing it with the exhibit UI

    // FIXME: it's probably a better idea to ask database.js for these lists:
    var typelist = [ "uri", "label", "pluralLabel" ];
    var proplist = [ "uri", "valueType", // [text|number|date|boolean|item|url]
		     "label", "reverseLabel",
		     "pluralLabel", "reversePluralLabel",
		     "groupingLabel", "reverseGroupingLabel" ];
    var columnProps = [ "valueParser", "arity" ];

    var parsed = {}; // accumulator of all data we scrape up (for loadData)
    var type = Exhibit.getAttribute( table, 'type' );
    var types = type && readAttributes( table, typelist );
    if( types ) {
	parsed.types = {};
	parsed.types[type] = types;
    }

    var fields = [], props = {}, columnData = [], row, col;
    var tr, trs = table.getElementsByTagName("tr");
    var th, ths = trs[0].getElementsByTagName("th");
    for( col = 0; th = ths[col]; col++ ) {
	var field = textOf( th ).trim();
	var attr = readAttributes( th, proplist );
	var name = Exhibit.getAttribute( th, 'name' );
	if( name ) {
	    attr = attr || {};
	    attr.label = attr.label || field;
	    field = name;
	}
	if( attr ) {
	    props[field] = attr;
	    parsed.properties = props;
	}
	fields.push( field );
	attr = readAttributes( th, columnProps ) || {};
	if( attr.valueParser && attr.valueParser in window ) {
	    attr.valueParser = window[attr.valueParser];
	} else { // provide a default valueParser:
	    if( attr.arity == "single" ) {
		return function( text, node, rowNo, colNo ) {
		    return text.trim();
		};
	    } else {
		attr.valueParser = function( text, node, rowNo, colNo ) {
		    if( text.indexOf(';') == -1 )
			return text.trim();
		    var data = text.split(';');
		    for( var i = 0; i<data.length; i++ )
			data[i] = data[i].trim();
		    return data;
		};
	    }
	}
	columnData[col] = attr;
    }
    // console.log( fields );

    var img, imgs = table.getElementsByTagName("img");
    while( img = imgs[0] ) // replace any images with their respective URLs
	img.parentNode.replaceChild( document.createTextNode( img.src ), img );

    var items = [], td, raw;
    for( row = 1; tr = trs[row]; row++ ) {
	var item = {};
	var tds = tr.getElementsByTagName("td");
	for( col = 0; td = tds[col]; col++ ) {
	    var raw = textOf( td );
	    data = columnData[col].valueParser( raw, td, row, col );
	    if( data == null || raw === "" ) {
		continue;
	    }
	    if( typeof data == 'object' && !(data instanceof Array) ) {
		for( var property in data ) {
		    item[property] = data[property];
		}
	    } else {
		item[fields[col]] = data;
	    }
	}
	if( type )
	    item.type = type;
	items.push( item );
	parsed.items = items;
    }
    return this.loadData( parsed );
};

Exhibit._Impl.prototype.loadData = function(data) {
    this._loadJSON(data, Exhibit._getURLWithoutQueryAndHash());
};

Exhibit._Impl.prototype.getBaseURL = function(url) {
    if (url.indexOf("://") < 0) {
        var url2 = this.getBaseURL(document.location.href);
        if (url.substr(0,1) == "/") {
            url = url2.substr(0, url2.indexOf("/", url2.indexOf("://") + 3)) + url;
        } else {
            url = url2 + url;
        }
    }
    
    var i = url.lastIndexOf("/");
    if (i < 0) {
        return "";
    } else {
        return url.substr(0, i+1);
    }
};

Exhibit._Impl.prototype.resolveURL = function(url) {
    if (url.indexOf("://") < 0) {
        var url2 = this.getBaseURL(document.location.href);
        if (url.substr(0,1) == "/") {
            url = url2.substr(0, url2.indexOf("/", url2.indexOf("://") + 3)) + url;
        } else {
            url = url2 + url;
        }
    }
    return url;
};

Exhibit._Impl.prototype.makeActionLink = function(text, handler, layer) {
    var a = document.createElement("a");
    a.href = "javascript:";
    a.className = "exhibit-action";
    a.innerHTML = text;
    
    var handler2 = function(elmt, evt, target) {
        if ("true" == elmt.getAttribute("disabled")) {
            SimileAjax.DOM.cancelEvent(evt);
            return false;
        } else {
            return handler(elmt, evt, target);
        }
    }
    SimileAjax.WindowManager.registerEvent(a, "click", handler2, layer);
    
    return a;
};

Exhibit._Impl.prototype.makeActionLinkWithObject = function(text, obj, handlerName, layer) {
    var a = document.createElement("a");
    a.href = "javascript:";
    a.className = "exhibit-action";
    a.innerHTML = text;
    
    var handler2 = function(elmt, evt, target) {
        if ("true" == elmt.getAttribute("disabled")) {
            SimileAjax.DOM.cancelEvent(evt);
            return false;
        } else {
            return obj[handlerName].call(obj, elmt, evt, target);
        }
    }
    SimileAjax.WindowManager.registerEvent(a, "click", handler2, layer);
    
    return a;
};

Exhibit._Impl.prototype.enableActionLink = function(a, enabled) {
    a.setAttribute("disabled", enabled ? "false" : "true");
    a.className = enabled ? "exhibit-action" : "exhibit-action-disabled";
};

Exhibit._Impl.prototype.makeItemSpan = function(itemID, label, layer) {
    if (label == null) {
        label = this._database.getObject(itemID, "label");
    }
    if (label == null) {
        label = itemID;
    }
    
    var a = document.createElement("a");
    a.href = this.getItemLink(itemID);
    a.className = "exhibit-item";
    a.innerHTML = label;
    
    var exhibit = this;
    var handler = function(elmt, evt, target) {
        exhibit.showItemInPopup(itemID, elmt);
        SimileAjax.DOM.cancelEvent(evt);
        return false;
    }
    SimileAjax.WindowManager.registerEvent(a, "click", handler, layer);
    
    return a;
};

Exhibit._Impl.prototype.makeValueSpan = function(label, valueType, layer) {
    var span = document.createElement("span");
    span.className = "exhibit-value";
    if (valueType == "url") {
        var a = document.createElement("a");
        a.target = "_blank";
        a.href = label;
        if (label.length > 50) {
            a.innerHTML = label.substr(0, 20) + " ... " + label.substr(label.length - 20);
        } else {
            a.innerHTML = label;
        }
        span.appendChild(a);
    } else {
        span.innerHTML = label;
    }
    return span;
};

Exhibit._Impl.prototype.showItemInPopup = function(itemID, elmt) {
    var coords = SimileAjax.DOM.getPageCoordinates(elmt);
    var bubble = SimileAjax.Graphics.createBubbleForPoint(
        document, 
        coords.left + Math.round(elmt.offsetWidth / 2), 
        coords.top + Math.round(elmt.offsetHeight / 2), 
        400, // px
        300  // px
    );
    
    var itemLensDiv = document.createElement("div");
    var itemLens = new Exhibit.Lens(itemID, itemLensDiv, this, this._configuration);
    bubble.content.appendChild(itemLensDiv);
};

Exhibit._Impl.prototype.makeCopyButton = function(itemID, layer) {
    var self = this;
    var button = Exhibit.Theme.createCopyButton(itemID == null);
    var handler = function(elmt, evt, target) {
        self._showCopyMenu(elmt, itemID);
        SimileAjax.DOM.cancelEvent(evt);
        return false;
    }
    SimileAjax.WindowManager.registerEvent(
        button, "click", handler, layer != null ? layer : SimileAjax.WindowManager.getHighestLayer());
        
    return button;
};

Exhibit._Impl.prototype.getExporters = function() {
    return this._exporters;
};

Exhibit._Impl.prototype.addExporter = function(exporter) {
    this._exporters.push(exporter);
};

Exhibit._Impl.prototype._loadJSON = function(o, url) {
    if ("types" in o) {
        this._database.loadTypes(o.types, url);
    }
    if ("properties" in o) {
        this._database.loadProperties(o.properties, url);
    }
    if ("items" in o) {
        this._database.loadItems(o.items, url);
    }
};

Exhibit._Impl.prototype._googleSpreadsheetsConverter = function(json, url) {
    var items = [];
    var properties = {};
    var types = {};
    var valueTypes = { "text" : true, "number" : true, "item" : true, "url" : true, "boolean" : true };
    
    var entries = json.feed.entry;
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var item = { label: entry.title.$t };
        var fields = entry.content.$t;
        
        var openBrace = fields.indexOf("{");
        while (openBrace >= 0) {
            var closeBrace = fields.indexOf("}", openBrace+1);
            if (closeBrace < 0) {
                break;
            }
            
            var fieldSpec = fields.substring(openBrace+1, closeBrace).trim().split(":");
            openBrace = fields.indexOf("{", closeBrace+1);
            
            var fieldValues = openBrace > 0 ? fields.substring(closeBrace+1, openBrace) : fields.substr(closeBrace+1);
            fieldValues = fieldValues.replace(/^\:\s+|,\s+$/g, "");
            
            var fieldName = fieldSpec[0].trim();
            var property = properties[fieldName];
            if (!(property)) {
                var fieldDetails = fieldSpec.length > 1 ? fieldSpec[1].split(",") : [];
                property = {};
                
                for (var d = 0; d < fieldDetails.length; d++) {
                    var detail = fieldDetails[d].trim();
                    var property = { single: false };
                    if (detail in valueTypes) {
                        property.valueType = detail;
                    } else if (detail == "single") {
                        property.single = true;
                    }
                }
                
                properties[fieldName] = property;
            }
            
            if (!property.single) {
                fieldValues = fieldValues.split(";");
                for (var v = 0; v < fieldValues.length; v++) {
                    fieldValues[v] = fieldValues[v].trim();
                }
            }
            item[fieldName] = fieldValues;
        }
        items.push(item);
    }
  
    return { types:types, properties:properties, items:items };
};

Exhibit._Impl.prototype._parseURL = function() {
    var params = SimileAjax.parseURLParameters(document.location.href);
    for (var i = 0; i < params.length; i++) {
        var p = params[i];
        if (p.name == "exhibit-state") {
            var state = this._deserializeState(p.value);
            if ("browseEngine" in state) {
                this._engine.setState(state["browseEngine"]);
            }
            if ("browsePanel" in state) {
                this._browsePanel.setState(state["browsePanel"]);
            }
            if ("viewPanel" in state) {
                this._viewPanel.setState(state["viewPanel"]);
            }
        }
    }
    
    var hash = document.location.hash;
    if (hash.length > 1) {
        this._focusID = decodeURIComponent(hash.substr(1));
    }
};

Exhibit._Impl.prototype._tryToFocusOnItem = function() {
    if (this._focusID != null && this._database.containsItem(this._focusID)) {
        var dom = Exhibit.Theme.createFocusDialogBox(this._focusID, this, this._configuration);
        dom.open();
        
        this._focusID = null;
    }
};

Exhibit._Impl.prototype._deserializeState = function(s) {
    return eval(s);
};

Exhibit._Impl.prototype._serializeState = function(state) {
    return Exhibit._anythingToJSON(state);
};

Exhibit._Impl.prototype._showCopyMenu = function(elmt, itemID) {
    var exhibit = this;
    var popupDom = Exhibit.Theme.createPopupMenuDom(elmt);
    
    var makeMenuItem = function(exporter) {
        popupDom.appendMenuItem(
            exporter.getLabel(),
            null,
            function() {
                var text = (itemID) ?
                    exporter.exportOne(itemID, exhibit) :
                    exporter.exportMany(
                        exhibit.getBrowseEngine().getCurrentCollection().getCurrentSet(), exhibit);
                        
                Exhibit.Theme.createCopyDialogBox(text).open();
            }
        );
    }
    
    var exporters = exhibit.getExporters();
    for (var i = 0; i < exporters.length; i++) {
        makeMenuItem(exporters[i]);
    }
    popupDom.open();
};

Exhibit._Impl.prototype._showBusyIndicator = function() {
    var scrollTop = ("scrollTop" in document.body) ?
        document.body.scrollTop :
        document.body.parentNode.scrollTop;
    var height = ("innerHeight" in window) ?
        window.innerHeight :
        ("clientHeight" in document.body ?
            document.body.clientHeight :
            document.body.parentNode.clientHeight);
        
    var top = Math.floor(scrollTop + height / 3);
    
    this._busyIndicator.style.top = top + "px";
    document.body.appendChild(this._busyIndicator);
};

Exhibit._Impl.prototype._hideBusyIndicator = function() {
    try {
        document.body.removeChild(this._busyIndicator);
    } catch(e) {
        // silent
    }
};

Exhibit._getURLWithoutQueryAndHash = function() {
    var url;
    if ("_urlWithoutQueryAndHash" in Exhibit) {
        url = Exhibit._urlWithoutQueryAndHash;
    } else {
        url = document.location.href;
        
        var hash = url.indexOf("#");
        var question = url.indexOf("?");
        if (hash >= 0) {
            url = url.substr(0, hash);
        } else if (question >= 0) {
            url = url.substr(0, question);
        }
        
        Exhibit._urlWithoutQueryAndHash = url;
    }
    return url;
};

Exhibit._getURLWithoutQuery = function() {
    var url;
    if ("_urlWithoutQuery" in Exhibit) {
        url = Exhibit._urlWithoutQuery;
    } else {
        url = document.location.href;
        
        var question = url.indexOf("?");
        if (question >= 0) {
            url = url.substr(0, question);
        }
        
        Exhibit._urlWithoutQuery = url;
    }
    return url;
};

Exhibit._anythingToJSON = function(x) {
    if (typeof x == "string") {
        return '"' + x + '"';
    } else if (typeof x == "boolean") {
        return x ? "true" : "false";
    } else if (typeof x == "number") {
        return x.toString();
    } else if (typeof x == "object") {
        if (x instanceof Array) {
            var s = "[";
            for (var i = 0; i < x.length; i++) {
                if (i > 0) s += ",";
                s += Exhibit._anythingToJSON(x[i]);
            }
            s += "]";
            return s;
        } else {
            var s = "{";
            var first = true;
            for (m in x) {
                if (first) {
                    first = false;
                } else {
                    s += ",";
                }
                
                s += m + ":" + Exhibit._anythingToJSON(x[m]);
            }
            s += "}";
            return s;
        }
    } else if (x == null) {
        return "null";
    } else {
        return "undefined";
    }
};

