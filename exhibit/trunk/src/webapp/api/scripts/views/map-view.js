/*==================================================
 *  Exhibit.MapView
 *==================================================
 */
 
Exhibit.MapView = function(exhibit, div, configuration, globalConfiguration) {
    this._exhibit = exhibit;
    this._div = div;
    this._configuration = configuration;
    this._globalConfiguration = globalConfiguration;
    
    var getLatLng = null;
    try {
        if ("latlng" in configuration) {
            var latlngExpression = Exhibit.Expression.parse(configuration.latlng);
            getLatLng = function(itemID, database) {
                var result = {};
                var x = latlngExpression.evaluateSingle(
                    { "value" : itemID }, 
                    { "value" : "item" }, 
                    "value",
                    database
                ).value;
                
                if (x != null) {
                    var a = x.split(",");
                    if (a.length == 2) {
                        result.lat = (typeof a[0] == "number") ? a[0] : parseFloat(a[0]);
                        result.lng = (typeof a[1] == "number") ? a[1] : parseFloat(a[1]);
                    }
                }
                return result;
            }
        } else if ("lat" in configuration && "lng" in configuration) {
            var latExpression = Exhibit.Expression.parse(configuration.lat);
            var lngExpression = Exhibit.Expression.parse(configuration.lng);
            getLatLng = function(itemID, database) {
                var result = {};
                var lat = latExpression.evaluateSingle(
                    { "value" : itemID }, 
                    { "value" : "item" }, 
                    "value",
                    database
                ).value;
                var lng = lngExpression.evaluateSingle(
                    { "value" : itemID }, 
                    { "value" : "item" }, 
                    "value",
                    database
                ).value;
                
                if (lat != null && lng != null) {
                    result.lat = (typeof lat == "number") ? lat : parseFloat(lat);
                    result.lng = (typeof lng == "number") ? lng : parseFloat(lng);
                }
                return result;
            }
        }
    } catch (e) {
        SimileAjax.Debug.exception(e);
    }
    
    var getMarkerKey = null;
    try {
        if ("marker" in configuration) {
            var markerExpression = Exhibit.Expression.parse(configuration.marker);
            getMarkerKey = function(itemID, database) {
                var key = markerExpression.evaluateSingle(
                    { "value" : itemID }, 
                    { "value" : "item" }, 
                    "value",
                    database
                ).value;
                
                return key != null ? key : "";
            }
        }
    } catch (e) {
        SimileAjax.Debug.exception(e);
    }
    
    this._getLatLng = (getLatLng != null) ? getLatLng : function(itemID, database) { return {}; };
    this._getMarkerKey = (getMarkerKey != null) ? getMarkerKey : function(itemID, database) { return ""; };
        
    this._latlngCache = new Object();
    this._markerKeyCache = new Object();
    this._markerCache = new Object();
    this._maxMarker = 0;
    
    this._initializeUI();
    
    var view = this;
    this._listener = { 
        onChange: function(handlerName) { 
            if (handlerName != "onGroup" && handlerName != "onUngroup") {
                view._reconstruct(); 
            }
        } 
    };
    this._exhibit.getBrowseEngine().addListener(this._listener);
};

Exhibit.MapView._markers = [
    {   color:  "FF9000"
    },
    {   color:  "5D7CBA"
    },
    {   color:  "A97838"
    },
    {   color:  "8B9BBA"
    },
    {   color:  "FFC77F"
    },
    {   color:  "003EBA"
    },
    {   color:  "29447B"
    },
    {   color:  "543C1C"
    }
];
Exhibit.MapView._wildcardMarker = {
    color:  "888888"
};
Exhibit.MapView._mixMarker = {
    color:  "FFFFFF"
};

Exhibit.MapView.lookupLatLng = function(set, addressExpressionString, outputProperty, outputTextArea, database, accuracy) {
    if (accuracy == undefined) {
        accuracy = 4;
    }
    
    var expression = Exhibit.Expression.parse(addressExpressionString);
    var jobs = [];
    set.visit(function(item) {
        var address = expression.evaluateSingle(
            { "value" : item }, 
            { "value" : "item" }, 
            "value",
            database
        ).value;
        
        if (address != null) {
            jobs.push({ item: item, address: address });
        }
    });
    
    var results = [];
    var geocoder = new GClientGeocoder();
    var cont = function() {
        if (jobs.length > 0) {
            var job = jobs.shift();
            geocoder.getLocations(
                job.address,
                function(json) {
                    if ("Placemark" in json) {
                        json.Placemark.sort(function(p1, p2) {
                            return p2.AddressDetails.Accuracy - p1.AddressDetails.Accuracy;
                        });
                    }
                    
                    if ("Placemark" in json && 
                        json.Placemark.length > 0 && 
                        json.Placemark[0].AddressDetails.Accuracy >= accuracy) {
                        
                        var coords = json.Placemark[0].Point.coordinates;
                        var lat = coords[1];
                        var lng = coords[0];
                        results.push("\t{ id: '" + job.item + "', " + outputProperty + ": '" + lat + "," + lng + "' }");
                    } else {
                        var segments = job.address.split(",");
                        if (segments.length == 1) {
                            results.push("\t{ id: '" + job.item + "' }");
                        } else {
                            job.address = segments.slice(1).join(",").replace(/^\s+/, "");
                            jobs.unshift(job); // do it again
                        }
                    }
                    cont();
                }
            );
        } else {
            outputTextArea.value = results.join(",\n");
        }
    };
    cont();
};

Exhibit.MapView.prototype.dispose = function() {
    this._exhibit.getBrowseEngine().removeListener(this._listener);
    
    this._div.innerHTML = "";
    
    this._dom.map = null;
    this._dom = null;
    this._div = null;
    this._exhibit = null;
    
    GUnload();
};

Exhibit.MapView.prototype._initializeUI = function() {
    var self = this;
    
    this._div.innerHTML = "";
    this._dom = Exhibit.MapView.theme.constructDom(
        this._exhibit, 
        this._div, 
        function(elmt, evt, target) {
            self._reset();
            SimileAjax.DOM.cancelEvent(evt);
            return false;
        }
    );
    
    var mapDiv = this._dom.getMapDiv();
    mapDiv.style.height = "400px";
    
    if ("constructMap" in this._configuration) {
        this._dom.map = this._configuration.constructMap(mapDiv);
    } else {
        this._dom.map = new GMap2(mapDiv);
        this._dom.map.enableDoubleClickZoom();
        this._dom.map.enableContinuousZoom();
        
        if ("center" in this._configuration) {
            var lat = this._configuration.center[0];
            var lng = this._configuration.center[1];
        } else {
            var lat = 20;
            var lng = 0;
        }
        var zoom = ("zoom" in this._configuration) ? this._configuration.zoom : 2;
        this._dom.map.setCenter(new GLatLng(lat, lng), zoom);
        
        if ("size" in this._configuration && this._configuration.size == "small") {
            this._dom.map.addControl(new GSmallMapControl());
        } else {
            this._dom.map.addControl(new GLargeMapControl());
        }
        
        if (!("scaleControl" in this._configuration) || this._configuration.scaleControl) {
            this._dom.map.addControl(new GScaleControl());
        }
        
        this._dom.map.addControl(new GMapTypeControl());
        if ("type" in this._configuration) {
            switch (this._configuration.type) {
            case "normal":
                this._dom.map.setMapType(G_NORMAL_MAP);
                break;
            case "satellite":
                this._dom.map.setMapType(G_SATELLITE_MAP);
                break;
            case "hybrid":
                this._dom.map.setMapType(G_HYBRID_MAP);
                break;
            }
        }
    }
    this._reconstruct();
};

Exhibit.MapView.prototype._reconstruct = function() {
    var self = this;
    var exhibit = this._exhibit;
    var database = exhibit.getDatabase();
    
    /*
     *  Get the current collection and check if it's empty
     */
    var collection = exhibit.getBrowseEngine().getCurrentCollection();
    var originalSize = 0;
    var currentSize = 0;
    var mappableSize = 0;
    if (collection != null) {
        originalSize = collection.originalSize();
        
        var currentSet = collection.getCurrentSet();
        currentSize = currentSet.size();
    }
    
    this._dom.map.clearOverlays();
    this._dom.clearLegend();
    if (currentSize > 0) {
        var locationToData = {};
        
        currentSet.visit(function(itemID) {
            var latlng;
            if (itemID in self._latlngCache) {
                latlng = self._latlngCache[itemID];
            } else {
                latlng = self._getLatLng(itemID, database);
                self._latlngCache[itemID] = latlng;
            }
            
            if ("lat" in latlng && "lng" in latlng) {
                var markerKey;
                if (itemID in self._markerKeyCache) {
                    markerKey = self._markerKeyCache[itemID];
                } else {
                    markerKey = self._getMarkerKey(itemID, database);
                    self._markerKeyCache[itemID] = markerKey;
                }
                
                var latlngKey = latlng.lat + "," + latlng.lng;
                var locationData = locationToData[latlngKey];
                if (!(locationData)) {
                    locationData = {
                        latlng:     latlng,
                        items:      [],
                        markerKey:  markerKey
                    };
                    locationToData[latlngKey] = locationData;
                } else if (locationData.markerKey != markerKey) {
                    locationData.markerKey = null;
                }
                
                locationData.items.push(itemID);
                
                mappableSize++;
            }
        });
        
        var usedKeys = {};
        var shape = Exhibit.MapView._defaultMarkerShape;
        var addMarkerAtLocation = function(locationData) {
            var items = locationData.items;
            
            var markerData;
            if (locationData.markerKey == null) {
                markerData = Exhibit.MapView._mixMarker;
            } else {
                usedKeys[locationData.markerKey] = true;
                if (locationData.markerKey in self._markerCache) {
                    markerData = self._markerCache[locationData.markerKey];
                } else {
                    markerData = Exhibit.MapView._markers[self._maxMarker];
                    self._markerCache[locationData.markerKey] = markerData;
                    self._maxMarker = (self._maxMarker + 1) % Exhibit.MapView._markers.length;
                }
            }
            
            var icon;
            if (items.length == 1) {
                if (!("icon" in markerData)) {
                    markerData.icon = Exhibit.MapView._makeIcon(shape, markerData.color, "space");
                }
                icon = markerData.icon;
            } else {
                icon = Exhibit.MapView._makeIcon(
                    shape, 
                    markerData.color, 
                    locationData.items.length > 50 ? "..." : locationData.items.length
                );
            }
            
            var point = new GLatLng(locationData.latlng.lat, locationData.latlng.lng);
            var marker = new GMarker(point, icon);
            
            GEvent.addListener(marker, "click", function() { 
                marker.openInfoWindow(self._createInfoWindow(items)); 
            });
            self._dom.map.addOverlay(marker);
        }
        for (latlngKey in locationToData) {
            addMarkerAtLocation(locationToData[latlngKey]);
        }
        
        var legendLabels = [];
        var legendIcons = [];
        var shape = Exhibit.MapView._defaultMarkerShape;
        for (markerKey in this._markerCache) {
            if (markerKey in usedKeys) {
                var markerData = this._markerCache[markerKey];
                legendLabels.push(markerKey);
                legendIcons.push(Exhibit.MapView._markerUrlPrefix + 
                    [   shape,
                        markerData.color,
                        [ "m", shape, markerData.color, "legend.png" ].join("-")
                    ].join("/")
                );
            }
        }
        legendLabels.push(Exhibit.MapView.l10n.mixedLegendKey);
        legendIcons.push(Exhibit.MapView._markerUrlPrefix + 
            [   shape,
                "FFFFFF",
                [ "m", shape, "FFFFFF", "legend.png" ].join("-")
            ].join("/")
        );
        
        this._dom.addLegendBlock(Exhibit.MapView.theme.constructLegendBlockDom(
            this._exhibit,
            Exhibit.MapView.l10n.colorLegendTitle,
            legendIcons,
            legendLabels
        ));
        
        this._dom.setTypes(database.getTypeLabels(currentSet)[currentSize > 1 ? 1 : 0]);
    }
    this._dom.setCounts(currentSize, mappableSize, originalSize);
};

Exhibit.MapView.prototype._createInfoWindow = function(items) {
    if (items.length > 1) {
        var ul = document.createElement("ul");
        for (var i = 0; i < items.length; i++) {
            var li = document.createElement("li");
            li.appendChild(this._exhibit.makeItemSpan(items[i]));
            ul.appendChild(li);
        }
        return ul;
    } else {
        var itemViewDiv = document.createElement("div");
        var itemView = new Exhibit.ItemView(items[0], itemViewDiv, this._exhibit, this._globalConfiguration);
        return itemViewDiv;
    }
};

Exhibit.MapView._iconData = null;
Exhibit.MapView._markerUrlPrefix = "http://simile.mit.edu/graphics/maps/markers/";
Exhibit.MapView._defaultMarkerShape = "square";

Exhibit.MapView._makeIcon = function(shape, color, label) {
    /*
     *  Some static initialization is delayed until here.
     */
    if (Exhibit.MapView._iconData == null) {
        Exhibit.MapView._iconData = {
            iconSize:           new GSize(40, 35),
            iconAnchor:         new GPoint(20, 35),
            shadowSize:         new GSize(55, 40),
            infoWindowAnchor:   new GPoint(19, 1),
            imageMap:           [ 6,0, 6,22, 15,22, 20,34, 25,25, 34,22, 34,0 ]
        };
    }
    
    var data = Exhibit.MapView._iconData;
    var icon = new GIcon(G_DEFAULT_ICON);
    icon.image = Exhibit.MapView._markerUrlPrefix + 
        [   shape,
            color,
            [ "m", shape, color, label + ".png" ].join("-")
        ].join("/");
    icon.shadow = Exhibit.MapView._markerUrlPrefix + [ "m", shape, "shadow.png" ].join("-");
    icon.iconSize = data.iconSize;
    icon.iconAnchor = data.iconAnchor;
    icon.imageMap = data.imageMap;
    icon.shadowSize = data.shadowSize;
    icon.infoWindowAnchor = data.infoWindowAnchor;
    
    return icon;
};

Exhibit.MapView.prototype._reset = function() {
    var state = {};
    var browseEngine = this._exhibit.getBrowseEngine();
    SimileAjax.History.addAction({
        perform: function() {
            state.restrictions = browseEngine.clearRestrictions();
        },
        undo: function() {
            browseEngine.applyRestrictions(state.restrictions);
        },
        label: Exhibit.OrderedViewFrame.l10n.resetActionTitle,
        uiLayer: SimileAjax.WindowManager.getBaseLayer()
    });
};