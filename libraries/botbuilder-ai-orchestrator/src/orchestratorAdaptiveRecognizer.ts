/**
 * @module botbuilder-ai-orchestrator
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { OrchestratorRecognizer } from './orchestratorRecognizer';
import { exception } from 'console';
import { StringExpression, BoolExpression, NumberExpression } from 'adaptive-expressions';
import { Entity, Activity, RecognizerResult } from 'botbuilder-core';
import { DialogContext } from 'botbuilder-dialogs';
import { EntityRecognizer, TextEntity, EntityRecognizerSet } from 'botbuilder-dialogs-adaptive';

const ReadText: any = require('read-text-file');

export class OrchestratorAdaptiveRecognizer {
    public id: string;
    public modelPath: StringExpression;
    public snapshotPath: StringExpression;
    public disambiguationScoreThreshold: NumberExpression;
    public detectAmbiguousIntents: BoolExpression;
    /**
     * The entity recognizers.
     */
    public entityRecognizers: EntityRecognizer[] = [];
    /**
     * Intent name to use if detectAmbiguousIntent is true
     */
    public chooseIntent: string = 'ChooseIntent';

    private recognizer : OrchestratorRecognizer;
    private _candidatesCollection: string = 'candidates';
    private _noneIntent: string = 'None';
    private _resolver: any = null;
    private _modelPath: string = null;
    private _snapShotPath: string = null;

    public async recognize(dialogContext: DialogContext, activity: Activity): Promise<RecognizerResult> {
        const text = activity.text || '';
        this._modelPath = this.modelPath.getValue(dialogContext.state);
        this._snapShotPath = this.snapshotPath.getValue(dialogContext.state);
        const detectAmbiguity = this.detectAmbiguousIntents.getValue(dialogContext.state);
        const disambiguationScoreThreshold = this.disambiguationScoreThreshold.getValue(dialogContext.state);
        let recognizerResult;

        if (text === '') return recognizerResult;

        await this.initializeModel();

        if (this.recognizer !== null) {
            // run entity recognizers

            recognizerResult = await this.recognizer.recongizeText(text);

            // run entity recognizers
            await this.recognizeEntities(dialogContext, text, activity.locale || '', recognizerResult);

            // disambiguate
            if (detectAmbiguity)
            {
                const recoResults = recognizerResult[this.recognizer.resultProperty];
                const topScoringIntent = recoResults[0].score;
                const scoreDelta = topScoringIntent - disambiguationScoreThreshold;
                const ambiguousIntents = recoResults.filter(x => x.score >= scoreDelta);
                if (ambiguousIntents.length !== 0) {
                    recognizerResult.intents[this._candidatesCollection] = { score: 1.0 };
                    recognizerResult[this._candidatesCollection] = {};
                    let ambiguousCollection = {};
                    ambiguousIntents.forEach(item => {
                        let candidate = {
                            // TODO with debugging
                        }
                    })
                }
            }

        }

        if (Object.entries(recognizerResult.intents).length == 0) {
            recognizerResult.intents[this._noneIntent] = { score: 1.0 };
        }

        await dialogContext.context.sendTraceActivity('OrchestratorRecognizer', recognizerResult, 'RecognizerResult', 'Orchestrator recognizer RecognizerResult');

        return recognizerResult;
    }

    private async recognizeEntities(dialogContext : DialogContext, text : string, locale : string, recognizerResult : RecognizerResult) {

        const entityPool: Entity[] = [];

        const textEntity = new TextEntity(text);
        textEntity['start'] = 0;
        textEntity['end'] = text.length;
        textEntity['score'] = 1.0;

        entityPool.push(textEntity);
        if (this.entityRecognizers) {
            const entitySet = new EntityRecognizerSet();
            entitySet.push(...this.entityRecognizers);
            const newEntities = await entitySet.recognizeEntities(dialogContext, text, locale, entityPool);
            if (newEntities.length > 0) {
                entityPool.push(...newEntities);
            }
        }

        for (let i = 0; i < entityPool.length; i++) {
            const entityResult = entityPool[i];
            let values = [];
            if (!recognizerResult.entities.hasOwnProperty(entityResult.type)) {
                recognizerResult.entities[entityResult.type] = values;
            } else {
                values = recognizerResult.entities[entityResult.type];
            }
            values.push(entityResult['text']);

            let instanceRoot = {};
            if (!recognizerResult.entities.hasOwnProperty('$instance')) {
                recognizerResult.entities['$instance'] = instanceRoot;
            } else {
                instanceRoot = recognizerResult.entities['$instance'];
            }

            let instanceData = [];
            if (!instanceRoot.hasOwnProperty(entityResult.type)) {
                instanceRoot[entityResult.type] = instanceData;
            } else {
                instanceData = instanceRoot[entityResult.type];
            }

            const instance = {
                startIndex: entityResult['start'],
                endIndex: entityResult['end'],
                score: 1.0,
                text: entityResult['text'],
                type: entityResult['type'],
                resolution: entityResult['resolution']
            };
            instanceData.push(instance);
        }
    }

    private async initializeModel() {
        if (this._modelPath === null) {
            throw new exception(`Missing "ModelPath" information.`);
        }

        if (this._snapShotPath === null) {
            throw new exception(`Missing "SnapshotPath" information.`);
        }

        if (this.recognizer === null) {
            this.recognizer = await OrchestratorRecognizer.createRecognizerAsync(this._modelPath, this._snapShotPath);
        }   
    }
};