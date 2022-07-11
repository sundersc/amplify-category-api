import {
  StringNode,
  str,
  Expression,
  comment,
  set,
  ref,
  methodCall,
  obj,
  qref,
  list,
  ifElse,
  compoundExpression,
  forEach,
  iff,
  raw,
  bool,
  toJson,
  printBlock,
} from 'graphql-mapping-template';
import { setArgs } from 'graphql-transformer-common';
import { ModelDirectiveConfiguration } from '../directive';
import { generateConditionSlot } from './common';

/**
 * Generates VTL template in update mutation
 * @param modelName Name of the model
 */
export const generateUpdateRequestTemplate = (modelName: string): string => {
  const statements: Expression[] = [
    set(
      ref('lambdaArgs'),
      obj({
        detail: obj({
          args: ref('context.arguments'),
          info: ref('context.info'),
          tableName: str(modelName),
          operation: str('UPDATE'),
        }),
      }),
    ),
    obj({
      version: str('2017-02-28'),
      operation: str('Invoke'),
      payload: methodCall(ref('util.toJson'), ref('lambdaArgs')),
    }),
  ];
  return printBlock('Update Request template')(compoundExpression(statements));
};

/**
 * Generates VTL template in create mutation
 * @param modelName Name of the model
 */
export const generateCreateRequestTemplate = (modelName: string): string => {
  const statements: Expression[] = [
    set(
      ref('lambdaArgs'),
      obj({
        detail: obj({
          args: ref('context.arguments'),
          info: ref('context.info'),
          tableName: str(modelName),
          operation: str('INSERT'),
        }),
      }),
    ),
    obj({
      version: str('2017-02-28'),
      operation: str('Invoke'),
      payload: methodCall(ref('util.toJson'), ref('lambdaArgs')),
    }),
  ];
  return printBlock('Create Request template')(compoundExpression(statements));
};

/**
 * Generate mapping template that sets default values for create mutation
 * @param modelConfig directive configuration
 */
export const generateCreateInitSlotTemplate = (modelConfig: ModelDirectiveConfiguration): string => {
  const statements: Expression[] = [
    // initialize defaultValues
    qref(
      methodCall(
        ref('ctx.stash.put'),
        str('defaultValues'),
        methodCall(ref('util.defaultIfNull'), ref('ctx.stash.defaultValues'), obj({})),
      ),
    ),
  ];

  if (modelConfig?.timestamps) {
    statements.push(set(ref('createdAt'), methodCall(ref('util.time.nowISO8601'))));
    statements.push(qref(methodCall(ref('ctx.stash.defaultValues.put'), str('id'), methodCall(ref('util.autoId')))));
    if (modelConfig.timestamps.createdAt) {
      statements.push(qref(methodCall(ref('ctx.stash.defaultValues.put'), str(modelConfig.timestamps.createdAt), ref('createdAt'))));
    }
    if (modelConfig.timestamps.updatedAt) {
      statements.push(qref(methodCall(ref('ctx.stash.defaultValues.put'), str(modelConfig.timestamps.updatedAt), ref('createdAt'))));
    }
  }
  statements.push(
    toJson(
      obj({
        version: str('2018-05-29'),
        payload: obj({}),
      }),
    ),
  );
  return printBlock('Initialization default values')(compoundExpression(statements));
};
/**
 * Generates VTL template in delete mutation
 *
 */
export const generateDeleteRequestTemplate = (modelName: string): string => {
  const statements: Expression[] = [
    set(
      ref('lambdaArgs'),
      obj({
        detail: obj({
          args: ref('context.arguments'),
          info: ref('context.info'),
          tableName: str(modelName),
          operation: str('DELETE'),
        }),
      }),
    ),
    obj({
      version: str('2017-02-28'),
      operation: str('Invoke'),
      payload: methodCall(ref('util.toJson'), ref('lambdaArgs')),
    }),
  ];
  return printBlock('Delete Request template')(compoundExpression(statements));
};

/**
 * Generate VTL template that sets the default values for Update mutation
 * @param modelConfig model directive configuration
 */
export const generateUpdateInitSlotTemplate = (modelConfig: ModelDirectiveConfiguration): string => {
  const statements: Expression[] = [
    // initialize defaultValues
    qref(
      methodCall(
        ref('ctx.stash.put'),
        str('defaultValues'),
        methodCall(ref('util.defaultIfNull'), ref('ctx.stash.defaultValues'), obj({})),
      ),
    ),
  ];
  if (modelConfig?.timestamps) {
    if (modelConfig.timestamps.updatedAt) {
      statements.push(set(ref('updatedAt'), methodCall(ref('util.time.nowISO8601'))));
      statements.push(qref(methodCall(ref('ctx.stash.defaultValues.put'), str(modelConfig.timestamps.updatedAt), ref('updatedAt'))));
    }
  }
  statements.push(
    toJson(
      obj({
        version: str('2018-05-29'),
        payload: obj({}),
      }),
    ),
  );
  return printBlock('Initialization default values')(compoundExpression(statements));
};

/**
 * generateApplyDefaultsToInputTemplate
 */
export const generateApplyDefaultsToInputTemplate = (target: string): Expression => compoundExpression([
  set(ref(target), methodCall(ref('util.defaultIfNull'), ref('ctx.stash.defaultValues'), obj({}))),
  qref(methodCall(ref(`${target}.putAll`), methodCall(ref('util.defaultIfNull'), ref('ctx.args.input'), obj({})))),
]);

const generateKeyConditionTemplate = (attributeExistsValue: boolean): Expression[] => {
  const statements: Expression[] = [
    comment('Begin - key condition'),
    ifElse(
      ref('ctx.stash.metadata.modelObjectKey'),
      compoundExpression([
        set(ref('keyConditionExpr'), obj({})),
        set(ref('keyConditionExprNames'), obj({})),
        forEach(ref('entry'), ref('ctx.stash.metadata.modelObjectKey.entrySet()'), [
          qref(
            methodCall(
              ref('keyConditionExpr.put'),
              str('keyCondition$velocityCount'),
              obj({ attributeExists: bool(attributeExistsValue) }),
            ),
          ),
          qref(methodCall(ref('keyConditionExprNames.put'), str('#keyCondition$velocityCount'), str('$entry.key'))),
        ]),
        qref(methodCall(ref('ctx.stash.conditions.add'), ref('keyConditionExpr'))),
      ]),
      compoundExpression([
        qref(methodCall(ref('ctx.stash.conditions.add'), obj({ id: obj({ attributeExists: bool(attributeExistsValue) }) }))),
      ]),
    ),
    comment('End - key condition'),
  ];

  return statements;
};
