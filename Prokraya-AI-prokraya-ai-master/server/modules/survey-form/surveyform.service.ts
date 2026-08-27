import * as formRepository from "./surveyform.repository";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import * as poService from "../procurement/procurement.service";
import * as suppService from "../vendors/vendors.service";
import { pool } from "../../db";
import { getContextPool } from "../../tenant-context";

dayjs.extend(customParseFormat);
const getPool = () => getContextPool() ?? pool;

export async function saveForm(data: any,userName: string) 
{   
    const { id, ...rest } = data; 
    const savedData = await formRepository.saveForm(rest,userName);
    return savedData;
}

export async function getFormById(id: string)
{
    const formData = await formRepository.findFormById(id);
    return formData;
}

export async function getFormQuestions(id: string) 
{
    return await formRepository.findFormQuestions(id);
}
export async function getAllForms(query : any) 
{
    return await formRepository.getAllForms(query);
}

export async function getFormStats(sessionUser: any) 
{
    const statsData = await formRepository.getFormStats(sessionUser)
    return statsData;
}

export async function saveFormQuestions(formId: string, questions: any[], userName: string,title:string) 
{
    await formRepository.saveFormQuestions(formId, questions,title);
}

export async function getAllMappingsOfForm(formId:string)
{
    await formRepository.getAllMappingsOfForm(formId);
}

export async function publishSurveyForm(
    formId: number,
    status: string,
    startDate?: string,
    endDate?: string
): Promise<string> 
{
    try 
    {
     const form = await formRepository.findFormById(String(formId))
        if (!form) 
        {
            return "Failure: Survey form not found.";
        }
        form.status = status;
        
        if (startDate) 
        {
          const parsedStart = dayjs(startDate, "DD/MM/YYYY HH:mm", true);
          if (!parsedStart.isValid()) 
            {
                return "Failure: Invalid Start Date.";
            }
            if (parsedStart.isBefore(dayjs())) {
                return "Failure: Bid Publish Date Must be Today's Date with Future time or Future Date!.";
            }
            form.startdate = parsedStart.toDate();
        }

        if (endDate) 
        {
            const parsedEnd = dayjs(endDate, "DD/MM/YYYY HH:mm", true);
            if (!parsedEnd.isValid()) 
            {
                return "Failure: Invalid End Date.";
            }
            form.closeddate = parsedEnd.toDate();
        }
        await formRepository.saveForm(form,"");
        return "Successfully processed your request";
    } 
    catch (error: any) 
    {
        console.error(error);
        return `Error - Unable to process your request due to ${error.message}`;
    }
}

export async function saveFormQusAndAnswers(id: string, entityNumber: string, formAnswerData: any[], username: any,formTitle : string,comment:string,type:string) 
{
    const poData = await poService.getPurchaseOrderDetail(entityNumber);
    if(poData)
    {
        return await formRepository.saveSurveyResponse(id,entityNumber,poData.supplier_id,formAnswerData,poData.supplier.supplier_name,formTitle,username,comment,poData.po_owner_name,type);
    }
    else
    {
        return "Error - Purchase order is not available."        
    }
}

export async function getAllSurveyRespOfForm(id: string,poNumber:string) 
{
    const respData = await formRepository.findRespFormById(id,poNumber);
    return respData;
}
export async function getRespAnswers(id: string) 
{
    const questionAnswer = await formRepository.getRespAnswer(id);
    return questionAnswer;
}

export async function deleteQuestionById(quesId: string) 
{
   const data = formRepository.deleteQuestion(quesId);
   return data;
}
export async function deleteFromById(formId: string) 
{
    const data = await formRepository.deleteForm(formId);
    return data;
}

export async function getAllResponse(query:any,id:string) 
{
    const result = await formRepository.getAllResponses(query,id);
    return result;
}

export async function caluclateScoreForQuestion(id: string, formAnswerData: any[]) 
{
     for (const answer of formAnswerData) 
    {
      const questionData = await getPool().query(`SELECT * FROM dbo.supp_surveyform_line_dtls WHERE id=$1`,
        [answer.ques_id]);

      answer.score = await formRepository.caluclateScoreForQuestion(
        questionData.rows[0].type,
        answer.answer,
        questionData.rows[0].weightage,
        answer.optionWeitage
      );
    }
  return formAnswerData;
}

export async function getStarStats() 
{
  const data = await formRepository.getStartStats();
  return data;  
}

export async function getMappedPoNumbers(id: string) 
{
    const mappedData = await formRepository.getMappedPoNumbers(id);
    return mappedData;   
}

export async function enableOrDisableFormById(id: string,status:string) 
{
    const data = await formRepository.enableOrDisableFormById(id,status);  
    return data;  
}
export async function publishform(id: string) 
{
    const data = await formRepository.publishFormById(id);
    return data;    
}


export async function getScoreAndRatingByForm(attribute_4: any, po_number: any) 
{
    const data = await formRepository.getScoreAndRatingByForm(attribute_4, po_number);
    return data;
}

export async function getSupplierRatingStats(suppId: string) 
{
    const data = await formRepository.getSupplierRatingStats(suppId);
    return data;
}

export async function getResponseDataByStat(cardType: string,query:any) 
{
    const data = await formRepository.getResponseDataByStat(cardType,query);
    return data;    
}

export async function updateEvaluationStatus(chatBot: string) 
{
     return await formRepository.updateEvaluationStatus(chatBot);
}
export async function getEvaluationModuleStatus() 
{
    const data = await formRepository.getEvaluationModuleStatus();
    return data; 
}

