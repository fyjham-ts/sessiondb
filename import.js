import { ScenarioType } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import fileList from "./scenarios/filelist.json" with { "type": "json" };
import { readFileSync } from "fs";
import Enquirer from "enquirer";
import EditorPrompt from "enquirer-prompt-editor";
import * as dateFns from "date-fns";

// Register it under the name "editor"

const prisma = new PrismaClient();
const enquirer = new Enquirer();
enquirer.register("editor", EditorPrompt);

async function setupScenarios() {
    for (var i=0; i < fileList.length; i++) {
        var newScenarios = JSON.parse(readFileSync("./scenarios/" + fileList[i], "utf-8"));
        for (var j = 0; j < newScenarios.length; j++) {
            var newScenario = newScenarios[j];
            await prisma.scenario.upsert({
                where: {
                    season_scenario_subscenario: { 
                        season: newScenario.season, 
                        scenario: newScenario.scenario, 
                        subscenario: newScenario.subscenario
                    }
                },
                create: newScenario,
                update: newScenario
            }).catch(ex => console.log("Error loading scenarios: " + ex));
        }
    }
}

async function loadSession() {
    const input = await enquirer.prompt({
        "type": "editor",
        "name": "base64",
        "message": "Paste data from RPGChronicles: "
    });
    if (!input.base64) return;
    try {
        const buffer = Buffer.from(input.base64, "base64");
        const json = buffer.toString("utf16le");
        const sessionData = JSON.parse(json);

        var scenarioInfo = sessionData.scenario.match(/^PFS2E ([0-9][1-9]*)-0?([1-9][0-9]*)$/);
        if (!scenarioInfo) {
            console.log("Cannot parse scenario title: " + sessionData.scenario);
        } else {
            const seasonNo = parseInt(scenarioInfo[1]);
            const scenarioNo = parseInt(scenarioInfo[2]);
            console.log("Scenario: " + seasonNo + "-" + scenarioNo);

            var scenario = await prisma.scenario.findFirstOrThrow({
                where: {
                    season: seasonNo,
                    scenario: scenarioNo
                }
            });
            var session = await prisma.session.findFirst({
                where: {
                    scenarioId: scenario.id,
                    date: sessionData.gameDate
                }
            });
            if (session) {
                console.log("Session already recorded - Sesion ID: " + session.id);
                return;
            }
            else {
                session = await prisma.session.create({
                    data: {
                        scenario: { connect: { id: scenario.id } },
                        date: sessionData.gameDate,
                        gm: {
                            connectOrCreate: {
                                where: { number: sessionData.gmOrgPlayNumber },
                                create: { number: sessionData.gmOrgPlayNumber }
                            }
                        }
                    }
                });
                for (var i=0; i < sessionData.signUps.length; i++) {
                    if (!sessionData.signUps[i].isGM) {
                        var signupData = sessionData.signUps[i];
                        var character = await prisma.character.findFirst({
                            where: {
                                player: { number: signupData.orgPlayNumber },
                                number: signupData.characterNumber
                            }
                        });
                        if (!character) {
                            character = await prisma.character.create({
                                data: {
                                    player: {
                                        connectOrCreate: {
                                            where: { number: signupData.orgPlayNumber },
                                            create: { number: signupData.orgPlayNumber }
                                        }
                                    },
                                    number: signupData.characterNumber,
                                    name: signupData.characterName
                                }
                            });
                        }
                        await prisma.signup.create({
                            data: {
                                session: { connect : { id: session.id } },
                                character: { connect : { id: character.id } }
                            }
                        });
                    }
                }
            }
        }
    } catch (ex) {
        console.log("Error loading data - peraphs this was not a valid session?" + ex);
    }
}

async function checkScenario() {
    const input = await enquirer.prompt([{
        "type": "numeral",
        "name": "season",
        "message": "Season #"
    },{
        "type": "numeral",
        "name": "scenario",
        "message": "Scenario #"
    }]);
    var scenario = await prisma.scenario.findFirst({
        where: {
            season: input.season,
            scenario: input.scenario
        },
        include: { 
            sessions: { 
                include: { 
                    signups : {
                        include: {
                            character: {
                                include: { player: true }
                            }
                        }
                    }
                }
            }
        }
    });
    console.log(scenario.season + ":" + String(scenario.scenario).padStart(2, '0') + " - " + scenario.name + (scenario.evergreen ? " (Evergreen)" : ""));
    scenario.sessions.forEach(s => {
        console.log("Played On: " + dateFns.format(s.date, 'dd MMM yyyy'));
        s.signups.forEach(su => {
            console.log(su.character.player.number + "-" + su.character.number + ": " + su.character.name);
        });
    });
}
async function pickCharacter(message, excludedIds) {
    const input = await enquirer.prompt([{
        "type": "text",
        "name": "name",
        "message": message + " (Name or Player Number)"
    }]);
    if (!input.name) return null;
    var charQuery = {
        where: {
            OR: [
                {name: { contains: input.name }}
            ]
        },
        include: { player: true, signups: { include: { session: { include: {scenario: true }}}}}
    };
    if (!isNaN(parseInt(input.name))) charQuery.where.OR.push({player: { number: parseInt(input.name) }})
    if (excludedIds) charQuery.where.id = { notIn: excludedIds};
    var characters = await prisma.character.findMany(charQuery);
    var character;
    if (characters.length == 0) {
        console.log("No character found");
        return null;
    } else {
        const charInput = await enquirer.prompt({
            "type": "select",
            "name": "id",
            "message": characters.length + " match(es) - please select one:",
            "choices": characters
                .map(c => ({ "name": c.id, "message": c.name + " (" + c.player.number + "-" + c.number + ")" }))
                .concat({"name": "", "message": "Cancel"})
        });
        if (charInput.id == "") return null;
        else character = characters.find(c => c.id == charInput.id);
    }
    return character;
}
async function findCharacter() {
    var character = await pickCharacter("Character name");
    if (!character) return;

    console.log(character.player.number + "-" + character.number + ": " + (character.name || "Name not found"));
    character.signups.forEach(su => {
        console.log(" - " + su.session.scenario.season + "-" + String(su.session.scenario.scenario).padStart(2, '0') + " - " + su.session.scenario.name + (su.session.scenario.evergreen ? " (Evergreen)" : "") + " (" + dateFns.format(su.session.date, 'dd MMMM yyyy') + ")");
    });
}
async function mergeCharacter() {
    var main = await pickCharacter("Character to merge into");
    if (!main) return;
    console.log(main.name + " selected");
    var second = await pickCharacter("Character to delete", [main.id]);
    if (!second) return;

    // Move signups
    await prisma.signup.updateMany({
        where: { characterId: second.id },
        data: { characterId: main.id }
    });

    // Delete the character
    await prisma.character.delete({where: { id: second.id }});

    // Check if the player is now empty
    var playerId = second.playerId;
    var secondPlayer = await prisma.player.findFirst({
        where: {
            id: playerId,
            characters: { none: {} }
        }
    });
    if (secondPlayer) {
        console.log("Player " + secondPlayer.number + " has no characters left - deleting.");
        await prisma.player.delete({where: { id: playerId }});
    }
}
async function findScenarios() {
    const input = await enquirer.prompt([{
        "type": "select",
        "name": "tier",
        "message": "Level Range",
        "choices": ["1-4", "3-6", "5-8"]
    },{
        "type": "text",
        "name": "player",
        "message": "Player # (Or multiple with commas)"
    }]);
    var searchQuery = {
        where: {
        }
    };
    if (input.player) {
        searchQuery.where.sessions = { none: { signups: { some : { 
            character: { player: { number: { in: input.player.split(",").map(n => parseInt(n)) } } }
        } } } };
    }
    switch (input.tier) {
        case "1-4":
            searchQuery.where.minLevel = { lte: 1 };
            searchQuery.where.maxLevel = { gte: 4 };
            break;
        case "3-6":
            searchQuery.where.minLevel = { lte: 3 };
            searchQuery.where.maxLevel = { gte: 6 };
            break;
        case "5-8":
            searchQuery.where.minLevel = { lte: 5 };
            searchQuery.where.maxLevel = { gte: 8 };
            break;
    }
    var scenarios = await prisma.scenario.findMany(searchQuery);
    scenarios.forEach(s => {
        console.log(s.season + "-" + String(s.scenario).padStart(2, "0") + " " + s.name);
    });
}
async function namePlayer() {

}
async function nameCharacter() {
    var character = await findCharacter();
    if (character) {
        const input = await enquirer.prompt({
            "type": "text",
            "name": "name",
            "message": "New name"
        });
        if (!input.name) return;
        await prisma.character.update({
            where: { id: character.id },
            data: { name: input.name }
        });
        console.log("Name updated");
    }
}

async function main() {
    var exit = false;
    while (!exit) {
        const menu = await enquirer.prompt({
            "type": "select",
            "name": "choice",
            "mesage": "Please select an option",
            "choices": [
                { "name": "loadSession", "message": "Load session" },
                { "name": "checkScenario", "message": "Check scenario" },
                { "name": "findScenarios", "message": "Find scenarios" },
                { "name": "findCharacter", "message": "Find character" },
                { "name": "mergeCharacter", "message": "Merge characters" },
                { "name": "loadScenarios", "message": "Reload scenarios" },
                { "name": "namePlayer", "message": "Name Player" },
                { "name": "nameCharacter", "message": "Name Character" },
                { "name": "exit", "message": "Exit" }
            ]
        });
        switch (menu.choice) {
            case "loadScenarios": 
                console.log("loading... this may take a moment");
                await setupScenarios();
                break;
            case "loadSession":
                await loadSession();
                break;
            case "checkScenario":
                await checkScenario();
                break;
            case "findScenarios": 
                await findScenarios();
                break;
            case "findCharacter": 
                await findCharacter();
                break;
            case "mergeCharacter":
                await mergeCharacter();
                break;
            case "namePlayer":
                await namePlayer();
                break;
            case "nameCharacter":
                await nameCharacter();
                break;
            case "exit":
                exit = true;
                break;
        }
    }
}
main();