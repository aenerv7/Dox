$httpClient.get("https://api.country.is/", function (error, response, data) {
    let parsed_data = JSON.parse(data);
    let content_string = parsed_data.ip + "\n" + parsed_data.country;
    $done({
        title: "IP",
        content: content_string,
        backgroundColor: "#131313",
        icon: "network",
    })
})