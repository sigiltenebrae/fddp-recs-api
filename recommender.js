const express = require('express');
const cors = require('cors');
const axios = require('axios');
const axios_rt = require('axios-request-throttle');

const config = require('./dbconfig');
const Pool = require('pg').Pool
const pool = new Pool({
    user: config.USER,
    host: config.HOST,
    database: config.DB,
    password: config.PASSWORD,
    port: 5432,
});

let commander_list = [
    "Belbe, Corrupted Observer",
    "Dakkon Blackblade",
    "Extus, Oriq Overlord // Awaken the Blood Avatar",
    "Gishath, Sun's Avatar",
    "Grimlock, Dinobot Leader // Grimlock, Ferocious King",
    "Jon Irenicus, Shattered One",
    "Lord of Tresserhorn",
    "Marchesa, the Black Rose",
    "Miirym, Sentinel Wyrm",
    "Najeela, the Blade-Blossom",
    "Odric, Blood-Cursed",
    "Otrimi, the Ever-Playful",
    "Raffine, Scheming Seer",
    "Thantis, the Warweaver"
]

/*****************************************
 *          MoxField Functions
 ****************************************/


function getMoxfieldId(commander_str) {
    return new Promise((resolve) => {
        axios.get('https://api2.moxfield.com/v2/cards/search?q=' + commander_str + '&page=1').then(res => {
            if (res && res.data && res.data.data && res.data.data.length != null && res.data.data.length > 0) {
                let id = null;
                for (let search_res of res.data.data) {
                    if (search_res.name === commander_str && search_res.id != null) {
                        id = search_res.id;
                    }
                }
                if (id == null) {
                    console.log('Commander not found: ' + commander_str);
                }
                resolve(id);
            }
            else {
                resolve(null);
            }
        }).catch(function (error) {
            console.log('error getting moxfield id');
            console.log(error);
            resolve(null);
        });
    });
}

function getMoxfieldCommanderList(commander_str) {
    return new Promise((resolve) => {
        getMoxfieldId(commander_str).then((m_id) => {
            if (m_id != null) {
                axios.get("https://api2.moxfield.com/v2/decks/search?pageNumber=1&pageSize=20&sortType=views&sortDirection=Descending&board=mainboard&commanderCardId=" + m_id).then(res => {
                    if(res && res.data && res.data.data) {
                        resolve(res.data.data);
                    }
                    else {
                        resolve(null);
                    }
                }).catch(function (error) {
                    console.log('error getting list for commander of id: ' + m_id);
                    console.log(error.code);
                    resolve(null);
                });
            }
            else {
                resolve(null);
            }
        });
    });
}

function getMoxfieldCommanderFromDeck(deck_str, cmdr_dict) {
    return new Promise((resolve) => {
        axios.get("https://api2.moxfield.com/v3/decks/all/" + deck_str).then(res => {
            if (res && res.data && res.data.boards && res.data.boards.commanders && res.data.boards.commanders.cards) {
                for(let [key, value] of Object.entries(res.data.boards.commanders.cards)) {
                    if (value.card && value.card.name) {
                        //console.log('    ' + value.card.name);
                        if(cmdr_dict[value.card.name] === undefined) {
                            cmdr_dict[value.card.name] = Object.entries(res.data.boards.commanders.cards).length === 1? 1: 0.5;
                        }
                        else {
                            cmdr_dict[value.card.name] += Object.entries(res.data.boards.commanders.cards).length === 1? 1: 0.5;
                        }
                    }
                }
                resolve(null);
            }
            else {
                resolve(null);
            }
        }).catch(function (error) {
            console.log('error getting data for deck: ' + deck_str);
            console.log(error.code);
            resolve(null);
        })
    });
}

function getMoxfieldDecksForUser(user_str, cmdr_dict) {
    return new Promise((resolve) => {
        axios.get("https://api2.moxfield.com/v2/users/" + user_str + "/decks?pageNumber=1&pageSize=50").then(res => {
            if (res && res.data && res.data.data && res.data.data.length != null && res.data.data.length > 0) {
                let decks = res.data.data;
                let deck_promises = [];
                for (let i = 0; i < decks.length; i++) {
                    if (decks[i].publicUrl) {
                        //console.log(decks[i].publicUrl.replace('https://www.moxfield.com/decks/', ''));
                        deck_promises.push(getMoxfieldCommanderFromDeck(decks[i].publicUrl.replace('https://www.moxfield.com/decks/', ''), cmdr_dict));
                    }
                }
                Promise.all(deck_promises).then(() => {
                    resolve(null);
                });
            }
            else {
                resolve(null);
            }
        }).catch(function (error) {
            console.log('error getting deck list for user: ' + user_str);
            console.log(error.code);
            resolve(null);
        });
    });
}

function getMoxfieldBasketForCommander(commander_str, cmdr_dict) {
    return new Promise((resolve) => {
        getMoxfieldCommanderList(commander_str).then(cmdr_list => {
            if (cmdr_list != null && cmdr_list.length != null && cmdr_list.length > 0) {
                let user_promises = [];
                for (let i = 0; i < cmdr_list.length; i++) {
                    if (cmdr_list[i].createdByUser && cmdr_list[i].createdByUser.userName) {
                        let user = cmdr_list[i].createdByUser.userName;
                        user_promises.push(getMoxfieldDecksForUser(user, cmdr_dict));
                    }
                    else {
                        resolve(null);
                    }
                }
                Promise.all(user_promises).then(() => {
                    console.log(commander_str + ' done.');
                    resolve(null);
                })
            }
            else {
                resolve(null);
            }
        });
    });
}

function getMoxfieldRecommendationForList(cmdr_list, cmdr_dict) {
    return new Promise((resolve) => {
        let start = Date.now();
        let cmdr_promises = [];
        for (let cmdr of cmdr_list) {
            cmdr_promises.push(getMoxfieldBasketForCommander(cmdr, cmdr_dict));
        }
        Promise.all(cmdr_promises).then(() => {
            console.log('Complete in ' + Math.round((Date.now() - start) / 1000) + ' seconds.')
            resolve();
        });
    })
}

/*****************************************
 *           Edhrec Functions
 * ****************************************/

function getEdhrecCardString(card_str) {
    let edhrec_name = card_str.toLowerCase();
    if (edhrec_name.includes(' //')) {
        edhrec_name = edhrec_name.substring(0, card_str.indexOf(' //'));
    }
    edhrec_name = edhrec_name.replace(/[`~!@#$%^&*()_|+=?;:'",.<>\{\}\[\]\\\/]/gi, '').replace(/ /g, '-');
    return edhrec_name;
}

function getEdhrecCardThemes(card_str, theme_dict, theme_href_dict) {
    return new Promise((resolve) => {
        axios.get('https://json.edhrec.com/pages/commanders/' + getEdhrecCardString(card_str) + '.json').then(res => {
            if (res.data && res.data.panels && res.data.panels.tribelinks && res.data.panels.tribelinks.themes && res.data.panels.tribelinks.themes.length != null && res.data.panels.tribelinks.themes.length > 0) {
                let themes = res.data.panels.tribelinks.themes;
                for (let i = 0; i < themes.length; i++) {
                    if (i === 3) {
                        break;
                    }
                    if(theme_dict[themes[i].value] === undefined) {
                        theme_dict[themes[i].value] = 1;
                    }
                    else {
                        theme_dict[themes[i].value] += 1;
                    }
                    theme_href_dict[themes[i].value] = themes[i]['href-suffix'];
                }
                resolve(null);
            }
            else {
                resolve(null);
            }
        }).catch(function (error) {
            console.log('error getting edhrec data for ' + card_str);
            console.log(error);
            resolve(null);
        })
    })
}

function getEdhrecCardThemesForList(cmdr_list, theme_dict, theme_href_dict) {
    return new Promise((resolve) => {
        let cmdr_promises = [];
        for (let cmdr of cmdr_list) {
            cmdr_promises.push(getEdhrecCardThemes(cmdr, theme_dict, theme_href_dict));
        }
        Promise.all(cmdr_promises).then(() => {
            resolve();
        })
    })
}

function getEdhrecCommandersForTheme(theme_str, theme_href_dict, theme_cmdr_dict) {
    return new Promise((resolve) => {
        let theme_href = '';
        if (theme_str.includes("Tribal")) {
            //theme_href = '/tribes' + theme_href_dict[theme_str] + 's';
            resolve(null);
        }
        else {
            theme_href = '/themes' + theme_href_dict[theme_str];
            axios.get('https://json.edhrec.com/pages' + theme_href + '.json').then( res => {
                if (res && res.data && res.data.container && res.data.container.json_dict && res.data.container.json_dict.cardlists && res.data.container.json_dict.cardlists.length) {
                    let cardlists = res.data.container.json_dict.cardlists;
                    for (let i = 0; i < cardlists.length; i++) {
                        if (cardlists[i].tag && cardlists[i].tag === 'topcommanders') {
                            if (cardlists[i].cardviews && cardlists[i].cardviews.length) {
                                for (let j = 0; j < cardlists[i].cardviews.length; j++) {
                                    if (j === 3) {
                                        break;
                                    }
                                    if (cardlists[i].cardviews[j].name) {
                                        if(theme_cmdr_dict[cardlists[i].cardviews[j].name] === undefined) {
                                            theme_cmdr_dict[cardlists[i].cardviews[j].name] = 1;
                                        }
                                        else {
                                            theme_cmdr_dict[cardlists[i].cardviews[j].name] += 1;
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                    resolve(null);
                }
                else {
                    resolve(null);
                }
            }).catch(function (error) {
                console.log('error getting edhrec theme data for ' + theme_str);
                console.log(error);
                resolve(null)
            });
        }
    })
}

function getEdhrecThemeDict(cmdr_list, theme_dict, theme_href_dict, theme_cmdr_dict) {
    return new Promise((resolve) => {
        getEdhrecCardThemesForList(cmdr_list, theme_dict, theme_href_dict).then(() => {
            let theme_promises = [];
            for (let [key, value] of Object.entries(theme_dict)) {
                theme_promises.push(getEdhrecCommandersForTheme(key, theme_href_dict, theme_cmdr_dict));
            }
            Promise.all(theme_promises).then(() => {
                resolve();
            });
        });
    });
}

function removeEdhrecTopCards(type, cmdr_dict) {
    return new Promise((resolve) => {
        axios.get("https://json.edhrec.com/pages/commanders/" + type + ".json").then( res => {
            if (res && res.data && res.data.cardlist) {
                for (let i = 0; i < res.data.cardlist.length; i++) {
                    if (i === 75) {
                        break;
                    }
                    if (res.data.cardlist[i].name) {
                        if(cmdr_dict[res.data.cardlist[i].name] !== undefined) {
                            cmdr_dict[res.data.cardlist[i].name] = 0;
                        }
                    }
                }
                resolve(null);
            }
            else {
                resolve(null);
            }
        }).catch(function (error) {
            console.log('error getting edhrec top cards');
            console.log(error);
            resolve(null)
        });
    })
}

function shiftThemes(cmdr_dict, theme_cmdr_dict) {
    for (let [key, value] of Object.entries(theme_cmdr_dict)) {
        if(cmdr_dict[key] !== undefined) {
            let theme_shift = (value / 5) + 1;
            cmdr_dict[key] *= theme_shift;
        }
    }
}

function clearExisting(cmdr_list, cmdr_dict) {
    for (let card of cmdr_list) {
        cmdr_dict[card] = 0;
    }
}

function fixBadCards(cmdr_dict) {
    if (cmdr_dict["Golos, Tireless Pilgrim"] !== undefined) {
        cmdr_dict["Golos, Tireless Pilgrim"] = 0;
    }
    if (cmdr_dict["Esika, God of the Tree // The Prismatic Bridge"] !== undefined) {
        cmdr_dict["Esika, God of the Tree // The Prismatic Bridge"] = 0;
    }

}

/*****************************************
 *           DB Functions
 * ****************************************/

function getUsers() {
    return new Promise((resolve) => {
        pool.query('SELECT * FROM users', (error, results) => {
            if (error) {
                console.log('error getting users');
                console.log(error);
                resolve([]);
            }
            else {
                if (results && results.rows) {
                    resolve(results.rows);
                }
                else {
                    resolve([])
                }
            }
        });
    });
}

function getCommanders(user_id) {
    return new Promise((res) => {
        pool.query('SELECT * FROM decks WHERE owner = ' + user_id, (error, results) => {
            if (error) {
                console.log('Failed to load decks for user: ' + user_id);
                res([]);
            } else {
                if (results && results.rows && results.rows.length != null && results.rows.length > 0) {
                    let deck_promises = [];
                    let commander_list = [];
                    for (let deck of results.rows) {
                        deck_promises.push(
                            new Promise((resolve) => {
                                pool.query('SELECT name FROM deck_cards WHERE deckid = ' + deck.id + ' AND iscommander = true', (e, r) => {
                                    if (e) {
                                        console.log('Error loading cards for deck: ' + deck.id);
                                        console.log(e);
                                        resolve();
                                    } else {
                                        if (r && r.rows && r.rows.length != null && r.rows.length > 0) {
                                            for (let card of r.rows) {
                                                if (!commander_list.includes(card.name)) {
                                                    commander_list.push(card.name);
                                                }
                                            }
                                            resolve();
                                        } else {
                                            resolve();
                                        }
                                    }
                                })
                            }));
                    }
                    Promise.all(deck_promises).then(() => {
                        commander_list.sort((a, b) => (a > b) ? 1 : -1);
                        res(commander_list);
                    });
                } else {
                    res([]);
                }
            }
        });
    })
}

function getCommanderLists() {
    return new Promise((resolve) => {
        getUsers().then((users) => {
            if (users && users.length > 0) {
                let commander_promises = [];
                let commander_lists = {};
                for (let user of users) {
                    commander_promises.push(new Promise((res) => {
                        getCommanders(user.id).then((cmdr_list) => {
                            commander_lists[user.id] = cmdr_list;
                            res();
                        });
                    }));
                }
                Promise.all(commander_promises).then(() => {
                    //console.log(JSON.stringify(commander_lists));
                    resolve(commander_lists);
                });
            }
            else {
                resolve(null);
            }
        });
    });
}

function updateUserRecommendations() {
    return new Promise((resolve) => {
        console.log('***********************************');
        console.log('Starting Rec Generation: ' + new Date().toLocaleString())
        getCommanderLists().then((commander_lists) => {
            if (commander_lists != null) {
                let rec_promises = [];
                for(let [key, value] of Object.entries(commander_lists)){
                    rec_promises.push(new Promise((res) => {
                        getRecommendations(value).then((user_recs) => {
                            console.log('Got recs for ' + key);
                            if (user_recs) {
                                //printRecs(user_recs);
                                pool.query('UPDATE users SET recs = $1, last_rec = now() WHERE id = $2', [JSON.stringify(user_recs), key],
                                    (error, results) => {
                                        if(error) {
                                            console.log('error updating recs for user');
                                            console.log(error);
                                        }
                                        res();
                                    });
                                res();
                            }
                            else {
                                res();
                            }
                        });
                    }));
                }
                Promise.all(rec_promises).then(() => {
                    console.log('Recs updated');
                    console.log('***********************************');
                    resolve();
                })
            }
            else {
                resolve();
            }
        });
    });
}

/*****************************************
 *           General Functions
 * ****************************************/

function jitter(range, cmdr_dict) {
    for (let [key, value] of Object.entries(cmdr_dict)) {
        cmdr_dict[key] *= ((Math.floor(Math.random() * (range * 10)) / 100) + (range / 10));
    }
}

function outputRecs(cmdr_dict) {
    let commander_recs = [];
    for(let [key, value] of Object.entries(cmdr_dict)) {
        if (!commander_list.includes(key)) {
            commander_recs.push({name: key, count: value});
        }
    }
    commander_recs.sort((a, b) => (a.count < b.count)? 1: -1);
    if (commander_recs.length > 20) {
        commander_recs = commander_recs.slice(0, 20);
    }
    return commander_recs;
}

function printRecs(commander_recs) {
    for (let i = 0; i < commander_recs.length; i++) {
        if (i > 19) {
            break;
        }
        console.log(commander_recs[i].name + ': ' + commander_recs[i].count);
    }
}

function getRecommendations(cmdr_list) {
    return new Promise((resolve) => {
        let cmdr_dict = {};
        let theme_dict = {};
        let theme_href_dict = {};
        let theme_cmdr_dict = {};
        getMoxfieldRecommendationForList(cmdr_list, cmdr_dict).then(() => {
            getEdhrecThemeDict(cmdr_list, theme_dict, theme_href_dict, theme_cmdr_dict).then(() => {
                removeEdhrecTopCards('year', cmdr_dict).then(() => {
                    removeEdhrecTopCards('month', cmdr_dict).then(() => {
                        shiftThemes(cmdr_dict, theme_cmdr_dict);
                        //jitter(7, cmdr_dict);
                        clearExisting(cmdr_list, cmdr_dict);
                        fixBadCards(cmdr_dict);
                        // printRecs(outputRecs(cmdr_dict));
                        resolve(outputRecs(cmdr_dict));
                    });
                });
            });
        });
    });
}

axios_rt.use(axios, {requestsPerSecond: 15});

let run_on_start = true;

getUsers().then((users) => {
    if (users && users.length && users.length > 0) {
        let update = false;
        for (let user of users){
            if (user.last_rec == null || (Math.abs(Date.now() - user.last_rec) / 1000) > (60 * 60 * 24)) {
                update = true;
            }
        }
        if (update || run_on_start) {
            console.log('db data too old, updating now');
            updateUserRecommendations().then();
        }
        else {
            console.log('db data is still new.');
        }
    }
})

setInterval(updateUserRecommendations, 60000 * 60 * 24);