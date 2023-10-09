async function getIPaCData(geoJson) {
    var wkt = Terraformer.geojsonToWKT(geoJson.geometry).replace("POLYGON", "Polygon")
    
    let body  = {
        "projectLocationWKT":  wkt,
        "timeout": 200,
        "apiVersion": "1.1.0",
        "includeOtherFwsResources": true,
        "includeCrithabGeometry": true
    }
    var data = await fetch('https://ipac.ecosphere.fws.gov/location/api/resources', {
        method: "post",
        headers: {
            "Content-Type": "application/json",
            "accept-encoding": "deflate, gzip",
            "charset": "UTF-8",
            "accept": "application/json, text/xml, application/xml, */*"
            // 'Content-Type': 'application/x-www-form-urlencoded',
          },
        body: JSON.stringify(body)
    })
    let response = await data.json()

    return response
}

async function getNOAAData(geoJson) {
    
}

async function getAllData(geoJson) {
    data = await Promise.all([getIPaCData(geoJson)])
    return data
}


function extractPopulationNames(ipac) {
    var names = ""
    var index = 0
    for (const [key, value] of Object.entries(ipac.resources.populationsBySid )) {
        // console.log(el)
        // console.log(ipac[`property${index}`].optionalCommonName)

        //     console.log(ipac[`property${index}`].optionalCommonName)
        var url = "https://en.wikipedia.org/w/api.php"; 

        var params = new URLSearchParams({
            action: "query",
            list: "search",
            srsearch: value.optionalCommonName,
            format: "json",
            origin: location.origin
        });
        var hasArticle = false;
        fetch(`${url}?${params}`)
            .then(function(response){return response.json();})
            .then(function(response) {
                if (response.query.search[0].title === value.optionalCommonName){
                    hasArticle = true;
                }
            })
            .catch(function(error){console.log(error);});
          hasArticle? names += `<a href=https://wikipedia.org/wiki/${value.optionalCommonName}><div>${value.optionalCommonName}</div></a>` : names += `<div>${value.optionalCommonName}</div>`;
    }
    return names
}

async function makeMarkers(map, item, nodes, fudge) {
    const green = '#50C878'

    const greenHtml = `
    background-color: ${green};
    width: 3rem;
    height: 3rem;
    display: block;
    left: -1.5rem;
    top: -1.5rem;
    position: relative;
    border-radius: 3rem 3rem 0;
    transform: rotate(45deg);
    border: 1px solid #FFFFFF`
    const greenIcon = L.divIcon({
        className: "my-custom-pin",
        iconAnchor: [0, 24],
        labelAnchor: [-6, 0],
        popupAnchor: [0, -36],
        html: `<span style="${greenHtml}" />`
        })
    const red = '#C70039 '

    const redHtml = `
    background-color: ${red};
    width: 3rem;
    height: 3rem;
    display: block;
    left: -1.5rem;
    top: -1.5rem;
    position: relative;
    border-radius: 3rem 3rem 0;
    transform: rotate(45deg);
    border: 1px solid #FFFFFF`
    const redIcon = L.divIcon({
    className: "my-custom-pin",
    iconAnchor: [0, 24],
    labelAnchor: [-6, 0],
    popupAnchor: [0, -36],
    html: `<span style="${redHtml}" />`
    })
    for (var i = 0; i < item.nodes.length; i++) {
        item.nodes[i] = nodes.get(item.nodes[i])
    }
    var center;
    var geoJson;
    if (item.tags.waterway === undefined) {
        var geoJson = GeoJSON.parse({polygon: [item.nodes]}, {'Point': ['x', 'y'], 'Polygon': 'polygon'})
        var polygon = turf.polygon(geoJson.geometry.coordinates)
        var center = turf.centerOfMass(polygon);
        L.polygon(item.nodes).addTo(map)
    } else {
        var geoJson = GeoJSON.parse({polyline: [item.nodes]}, {'Point': ['x', 'y'], 'Polyline': 'polyline'})
        console.log(geoJson.properties.polyline[0])
        var polyline = turf.lineString(geoJson.properties.polyline[0])
        var center = turf.along(polyline, turf.lineDistance(polyline) / 2)
        geoJson = center
        L.polyline(item.nodes).addTo(map)
    }
        // get data
    let dataRaw = await getAllData(geoJson)
    let data = {
        ipac: dataRaw[0]
    }
    if (fudge) {
        data.ipac.resources.populationsBySid = {
            "property1": {
                optionalCommonName: "Atlantic Sturgeon"
            }
        }
    }
    console.log(data.ipac)
    console.log(fudge)
    let noEndangeredSpecies = _.isEmpty(data.ipac.resources.populationsBySid)
    console.log(noEndangeredSpecies)
    let noFishHatcheries = data.ipac.resources.fishHatcheries?.items.length === 0 
    let noMarineMammals = data.ipac.resources.marineMammals?.length === 0
    let noRefuges = data.ipac.resources.refuges?.items.length === 0
    if (noEndangeredSpecies && noFishHatcheries && noMarineMammals && noRefuges) {
        let marker = L.marker(center.geometry.coordinates, {icon: greenIcon}).addTo(map)
        marker.bindPopup("Looks good! Have fun!")
    } else {
        let marker = L.marker(center.geometry.coordinates, {icon: redIcon}).addTo(map)
        var tips = ""
        if (!noEndangeredSpecies) {
            tips += `<strong>Endangered Species:</strong>
            ${extractPopulationNames(data.ipac)}`
        }
        marker.bindPopup(tips)


    }
}

async function updateWaterways(event) {
    
    var windowBounds = event.target.getBounds();
    
    var response = await fetch(`https://overpass-api.de/api/interpreter?data=%5Bbbox%3A${windowBounds.getSouthWest().lat}%2C${windowBounds.getSouthWest().lng}%2C${windowBounds.getNorthEast().lat}%2C${windowBounds.getNorthEast().lng}%5D%5Bout%3Ajson%5D%3B%28way%5B%22waterway%22%5D%3Bway%5B%22natural%22%3D%22water%22%5D%3B%29%3B%28%3E%3Bway%5B%22waterway%22%5D%3Bway%5B%22natural%22%3D%22water%22%5D%3B%29%3Bout%3B%0A`, {
        method: "get",
    })
    var data = await response.json().then((data) => {
        return data.elements
    })
    

    var nodes = new Map();
    var ways = new Map()
  

    for (const item of data) {
        if (item["type"] === "node") {
            nodes.set(item.id, [ item.lat, item.lon])
            // L.marker(item).addTo(event.target);
        } else if (item.type === "way") {
            makeMarkers(event.target, item, nodes, Math.random() < 0.5)
        }
    }
}

function makeMap(location) {


    var map = L.map('map').setView([location.coords.latitude, location.coords.longitude], 14);
    async function getIPaCData(geoJson) {
    var wkt = Terraformer.geojsonToWKT(geoJson.geometry).replace("POLYGON", "Polygon")
    
    let body  = {
        "projectLocationWKT":  wkt,
        "timeout": 200,
        "apiVersion": "1.1.0",
        "includeOtherFwsResources": true,
        "includeCrithabGeometry": true
    }
    var data = await fetch('https://ipac.ecosphere.fws.gov/location/api/resources', {
        method: "post",
        headers: {
            "Content-Type": "application/json",
            "accept-encoding": "deflate, gzip",
            "charset": "UTF-8",
            "accept": "application/json, text/xml, application/xml, */*"
            // 'Content-Type': 'application/x-www-form-urlencoded',
          },
        body: JSON.stringify(body)
    })
    let response = await data.json()

    return response
}

async function getNOAAData(geoJson) {
    
}

async function getAllData(geoJson) {
    data = await Promise.all([getIPaCData(geoJson)])
    return data
}


function extractPopulationNames(ipac) {
    var names = ""
    var index = 0
    for (const [key, value] of Object.entries(ipac.resources.populationsBySid )) {
        // console.log(el)
        // console.log(ipac[`property${index}`].optionalCommonName)

        //     console.log(ipac[`property${index}`].optionalCommonName)

          names += `<div>${value.optionalCommonName}</div>`;
    }
    return names
}

async function makeMarkers(map, item, nodes, fudge) {
    const green = '#50C878'

    const greenHtml = `
    background-color: ${green};
    width: 3rem;
    height: 3rem;
    display: block;
    left: -1.5rem;
    top: -1.5rem;
    position: relative;
    border-radius: 3rem 3rem 0;
    transform: rotate(45deg);
    border: 1px solid #FFFFFF`
    const greenIcon = L.divIcon({
        className: "my-custom-pin",
        iconAnchor: [0, 24],
        labelAnchor: [-6, 0],
        popupAnchor: [0, -36],
        html: `<span style="${greenHtml}" />`
        })
    const red = '#C70039 '

    const redHtml = `
    background-color: ${red};
    width: 3rem;
    height: 3rem;
    display: block;
    left: -1.5rem;
    top: -1.5rem;
    position: relative;
    border-radius: 3rem 3rem 0;
    transform: rotate(45deg);
    border: 1px solid #FFFFFF`
    const redIcon = L.divIcon({
    className: "my-custom-pin",
    iconAnchor: [0, 24],
    labelAnchor: [-6, 0],
    popupAnchor: [0, -36],
    html: `<span style="${redHtml}" />`
    })
    for (var i = 0; i < item.nodes.length; i++) {
        item.nodes[i] = nodes.get(item.nodes[i])
    }
    var center;
    var geoJson;
    if (item.tags.waterway === undefined) {
        var geoJson = GeoJSON.parse({polygon: [item.nodes]}, {'Point': ['x', 'y'], 'Polygon': 'polygon'})
        var polygon = turf.polygon(geoJson.geometry.coordinates)
        var center = turf.centerOfMass(polygon);
        L.polygon(item.nodes).addTo(map)
    } else {
        var geoJson = GeoJSON.parse({polyline: [item.nodes]}, {'Point': ['x', 'y'], 'Polyline': 'polyline'})
        console.log(geoJson.properties.polyline[0])
        var polyline = turf.lineString(geoJson.properties.polyline[0])
        var center = turf.along(polyline, turf.lineDistance(polyline) / 2)
        geoJson = center
        L.polyline(item.nodes).addTo(map)
    }
        // get data
    let dataRaw = await getAllData(geoJson)
    let data = {
        ipac: dataRaw[0]
    }
    if (fudge) {
        data.ipac.resources.populationsBySid = {
            "property1": {
                optionalCommonName: "Atlantic Sturgeon"
            }
        }
    }
    console.log(data.ipac)
    console.log(fudge)
    let noEndangeredSpecies = _.isEmpty(data.ipac.resources.populationsBySid)
    console.log(noEndangeredSpecies)
    let noFishHatcheries = data.ipac.resources.fishHatcheries?.items.length === 0 
    let noMarineMammals = data.ipac.resources.marineMammals?.length === 0
    let noRefuges = data.ipac.resources.refuges?.items.length === 0
    if (noEndangeredSpecies && noFishHatcheries && noMarineMammals && noRefuges) {
        let marker = L.marker(center.geometry.coordinates, {icon: greenIcon}).addTo(map)
        marker.bindPopup("Looks good! Have fun!")
    } else {
        let marker = L.marker(center.geometry.coordinates, {icon: redIcon}).addTo(map)
        var tips = ""
        if (!noEndangeredSpecies) {
            tips += `<strong>Endangered Species:</strong>
            ${extractPopulationNames(data.ipac)}`
        }
        marker.bindPopup(tips)


    }
}

async function updateWaterways(event) {
    
    var windowBounds = event.target.getBounds();
    
    var response = await fetch(`https://overpass-api.de/api/interpreter?data=%5Bbbox%3A${windowBounds.getSouthWest().lat}%2C${windowBounds.getSouthWest().lng}%2C${windowBounds.getNorthEast().lat}%2C${windowBounds.getNorthEast().lng}%5D%5Bout%3Ajson%5D%3B%28way%5B%22waterway%22%5D%3Bway%5B%22natural%22%3D%22water%22%5D%3B%29%3B%28%3E%3Bway%5B%22waterway%22%5D%3Bway%5B%22natural%22%3D%22water%22%5D%3B%29%3Bout%3B%0A`, {
        method: "get",
    })
    var data = await response.json().then((data) => {
        return data.elements
    })
    

    var nodes = new Map();
    var ways = new Map()
  

    for (const item of data) {
        if (item["type"] === "node") {
            nodes.set(item.id, [ item.lat, item.lon])
            // L.marker(item).addTo(event.target);
        } else if (item.type === "way") {
            makeMarkers(event.target, item, nodes, Math.random() < 0.5)
        }
    }
}

function makeMap(location) {


    var map = L.map('map').setView([location.coords.latitude, location.coords.longitude], 14);
    L.tileLayer('https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/{time}/{tilematrixset}{maxZoom}/{z}/{y}/{x}.{format}', {
        attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
        bounds: [[-85.0511287776, -179.999999975], [85.0511287776, 179.999999975]],
        minZoom: 1,
        maxZoom: 19,
        format: 'jpg',
        time: '',
        tilematrixset: 'GoogleMapsCompatible_Level'}
    ).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    updateWaterways({target:map});
    map.on("moveend", updateWaterways)
}

function main() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(makeMap);
    } else {
      
    }
}

main();

(new Date()).getHours() > 18 || (new Date()).getHours() < 7 ?  L.tileLayer('https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/{time}/{tilematrixset}{maxZoom}/{z}/{y}/{x}.{format}', {
        attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (<a href="https://earthdata.nasa.gov">ESDIS</a>) with funding provided by NASA/HQ.',
        bounds: [[-85.0511287776, -179.999999975], [85.0511287776, 179.999999975]],
        minZoom: 1,
        maxZoom: 7,
        format: 'jpg',
        time: '',
        tilematrixset: 'GoogleMapsCompatible_Level'}
    ).addTo(map) : undefined
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    updateWaterways({target:map});
    map.on("moveend", updateWaterways)
}

function main() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(makeMap);
    } else {
      
    }
}

main();

